-- ============================================================
-- SegmentApp · Migración 18 · Fase 12C
--   1) Clases terapéuticas con niveles (A → A01 → A01A → A02A1).
--   2) Historial de catálogos: cada archivo subido queda guardado
--      (comprimido, en el almacén privado) con su resumen.
--   3) Crear el acceso de una persona desde la app (VM, GD, Gerente
--      Nacional o admin), con clave temporal. Ya no hace falta Cloud
--      Shell para usuarios.
--   4) Quién está pendiente de acceso: visitadores sin usuario y
--      distritos sin GD.
--   5) Configuración: laboratorios propios (PHQ, LST), productos que el
--      admin quitó a mano y "Cómo descargarlo" de cada fuente.
-- Aditiva. Deshacer: supabase/rollback/20261108120000_deshacer_accesos_y_catalogos.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1) Clases terapéuticas con niveles
-- ------------------------------------------------------------
alter table public.catalogo_clases add column if not exists nivel smallint;
alter table public.catalogo_clases add column if not exists padre text;
comment on column public.catalogo_clases.nivel is '1 = grupo anatómico (A), 2 = A01, 3 = A01A, 4 = A02A1';

create function public.admin_guardar_clases(p_filas jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_nuevas integer := 0;
    v_cambiadas integer := 0;
    v_total integer := jsonb_array_length(coalesce(p_filas, '[]'::jsonb));
begin
    perform public._exigir_admin();
    select count(*) filter (where c.codigo is null),
           count(*) filter (where c.codigo is not null and (c.nombre, c.nivel, c.padre) is distinct from (x.nombre, x.nivel, x.padre))
      into v_nuevas, v_cambiadas
      from jsonb_to_recordset(p_filas) as x(codigo text, nombre text, nivel smallint, padre text)
      left join public.catalogo_clases c on c.codigo = x.codigo;
    insert into public.catalogo_clases as c (codigo, nombre, nivel, padre)
    select distinct on (codigo) codigo, nombre, nivel, padre
      from jsonb_to_recordset(p_filas) as x(codigo text, nombre text, nivel smallint, padre text)
     where coalesce(codigo, '') <> ''
    on conflict (codigo) do update set nombre = excluded.nombre, nivel = excluded.nivel, padre = excluded.padre, actualizado_en = now()
     where (c.nombre, c.nivel, c.padre) is distinct from (excluded.nombre, excluded.nivel, excluded.padre);
    return jsonb_build_object('ok', true, 'total', v_total, 'nuevas', v_nuevas, 'cambiadas', v_cambiadas,
                              'iguales', v_total - v_nuevas - v_cambiadas);
end;
$$;
revoke all on function public.admin_guardar_clases(jsonb) from public;
grant execute on function public.admin_guardar_clases(jsonb) to authenticated;

-- ------------------------------------------------------------
-- 2) Historial de catálogos (el archivo original queda en el almacén)
-- ------------------------------------------------------------
create table public.catalogo_versiones (
    id             uuid primary key default gen_random_uuid(),
    tipo           text not null,          -- especialidades | laboratorios | productos | clases
    nombre_archivo text not null,
    ruta           text,                   -- en el almacén "datos" (catalogos/…), comprimido
    bytes          bigint,
    registros      integer not null default 0,
    nuevas         integer not null default 0,
    cambiadas      integer not null default 0,
    subido_por     uuid default auth.uid() references public.perfiles (id),
    subido_en      timestamptz not null default now()
);
alter table public.catalogo_versiones enable row level security;
revoke all on public.catalogo_versiones from anon;
grant select, insert on public.catalogo_versiones to authenticated;
create policy catalogo_versiones_ver on public.catalogo_versiones for select to authenticated using ((select public.es_admin()));
create policy catalogo_versiones_crear on public.catalogo_versiones for insert to authenticated with check ((select public.es_admin()));

-- ------------------------------------------------------------
-- 3) Crear el acceso de una persona (clave temporal; al entrar crea la suya)
-- ------------------------------------------------------------
create function public.admin_crear_usuario(
    p_correo text, p_nombre text, p_rol text, p_clave text,
    p_visitador text default null, p_distritos text[] default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
    v_id uuid := gen_random_uuid();
    v_correo text := lower(trim(coalesce(p_correo, '')));
    v_nombre text := trim(coalesce(p_nombre, ''));
    v_visitador text := upper(trim(coalesce(p_visitador, '')));
    v_codigo text;
begin
    perform public._exigir_admin();
    if p_rol not in ('vm', 'gd', 'gte_nacional', 'admin') then
        raise exception 'Rol no válido.' using errcode = '22023';
    end if;
    if v_nombre = '' then raise exception 'Escribe el nombre.' using errcode = '22023'; end if;
    if v_correo !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
        raise exception 'El correo no es válido.' using errcode = '22023';
    end if;
    if exists (select 1 from auth.users where lower(email) = v_correo)
       or exists (select 1 from public.perfiles where correo = v_correo) then
        raise exception 'Ese correo ya lo usa otra persona.' using errcode = '23505';
    end if;
    if length(coalesce(p_clave, '')) < 8 then
        raise exception 'La clave temporal debe tener al menos 8 caracteres.' using errcode = '22023';
    end if;
    if p_rol = 'vm' and not exists (select 1 from public.visitadores where nombre_sector = v_visitador) then
        raise exception 'No existe el visitador "%" en el fichero.', v_visitador using errcode = '22023';
    end if;
    if p_rol = 'gd' then
        if coalesce(array_length(p_distritos, 1), 0) = 0 then
            raise exception 'Elige al menos un distrito.' using errcode = '22023';
        end if;
        foreach v_codigo in array p_distritos loop
            if not exists (select 1 from public.distritos where codigo = v_codigo) then
                raise exception 'No existe el distrito %.', v_codigo using errcode = '22023';
            end if;
            if exists (select 1 from public.perfil_distritos pd join public.distritos d on d.id = pd.distrito_id
                        join public.perfiles p on p.id = pd.perfil_id where d.codigo = v_codigo and p.activo) then
                raise exception 'El distrito % ya tiene un GD con acceso.', v_codigo using errcode = '23505';
            end if;
        end loop;
    end if;

    -- El usuario de Supabase (igual que lo crea Supabase: correo confirmado, sin enviar nada)
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', v_correo,
            extensions.crypt(p_clave, extensions.gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'rol', p_rol, 'nombre', v_nombre),
            '{"clave_temporal": true}'::jsonb, now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_id, v_id::text, 'email',
            jsonb_build_object('sub', v_id::text, 'email', v_correo, 'email_verified', true, 'phone_verified', false),
            null, now(), now());

    -- Su perfil (el disparador ya lo creó con el rol; se asegura) y su vínculo
    insert into public.perfiles (id, correo, nombre, rol, activo)
    values (v_id, v_correo, v_nombre, p_rol::public.rol_app, true)
    on conflict (id) do update set correo = excluded.correo, nombre = excluded.nombre, rol = excluded.rol, activo = true;
    if p_rol = 'vm' then
        update public.visitadores set perfil_id = v_id, activo = true where nombre_sector = v_visitador;
    elsif p_rol = 'gd' then
        insert into public.perfil_distritos (perfil_id, distrito_id)
        select v_id, d.id from public.distritos d where d.codigo = any (p_distritos)
        on conflict (distrito_id) do update set perfil_id = excluded.perfil_id;
    end if;
    return jsonb_build_object('ok', true, 'id', v_id, 'correo', v_correo, 'nombre', v_nombre, 'rol', p_rol);
end;
$$;
revoke all on function public.admin_crear_usuario(text, text, text, text, text, text[]) from public;
grant execute on function public.admin_crear_usuario(text, text, text, text, text, text[]) to authenticated;

-- ------------------------------------------------------------
-- 4) Pendientes de acceso: visitadores del fichero sin usuario activo y distritos sin GD activo
-- ------------------------------------------------------------
create function public.admin_pendientes_acceso()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
    perform public._exigir_admin();
    return jsonb_build_object(
        'visitadores', coalesce((
            select jsonb_agg(jsonb_build_object('nombre', v.nombre_sector, 'distrito', d.nombre, 'codigo_distrito', d.codigo, 'linea', v.linea)
                             order by v.nombre_sector)
              from public.visitadores v
              left join public.distritos d on d.id = v.distrito_id
              left join public.perfiles p on p.id = v.perfil_id
             where v.activo and (p.id is null or not p.activo)
               and exists (select 1 from public.fichero f join public.data_snapshots s on s.id = f.snapshot_id
                            where f.visitador_id = v.id and s.es_vigente)), '[]'::jsonb),
        'distritos', coalesce((
            select jsonb_agg(jsonb_build_object('codigo', d.codigo, 'nombre', d.nombre) order by d.codigo)
              from public.distritos d
             where d.activo
               and not exists (select 1 from public.perfil_distritos pd join public.perfiles p on p.id = pd.perfil_id
                                where pd.distrito_id = d.id and p.activo)), '[]'::jsonb));
end;
$$;
revoke all on function public.admin_pendientes_acceso() from public;
grant execute on function public.admin_pendientes_acceso() to authenticated;

-- ------------------------------------------------------------
-- 5) Configuración
-- ------------------------------------------------------------
insert into public.configuracion (clave, valor, descripcion) values
('laboratorios_propios', '["PHQ", "LST"]',
 'Abreviaturas de los laboratorios de La Santé: sus productos cuentan como propios automáticamente'),
('productos_phq_excluidos', '[]',
 'Productos de los laboratorios propios que el admin quitó a mano (no se vuelven a marcar solos)'),
('instructivos_descarga', '{}',
 'Cómo descargar cada fuente (fichero del CRM, mercados de CloseUp y catálogos): texto que escribe el admin')
on conflict (clave) do nothing;
