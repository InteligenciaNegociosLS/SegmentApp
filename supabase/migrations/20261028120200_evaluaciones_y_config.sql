-- ============================================================
-- SegmentApp · Migración 3/4 · Evaluaciones, historial,
-- configuración compartida y registro de fallas
-- Aditiva: solo crea objetos nuevos. Deshacer: supabase/rollback/
-- ============================================================

-- ------------------------------------------------------------
-- Evaluaciones / encuestas del visitador (una por médico y mercado)
-- Nunca se borran: "eliminar" marca eliminado_en (se puede deshacer).
-- ------------------------------------------------------------
create table public.evaluaciones (
    id                uuid primary key default gen_random_uuid(),
    visitador_id      uuid not null references public.visitadores (id),
    matricula         text not null,
    matricula_norm    text generated always as (ltrim(split_part(btrim(matricula), '_', 1), '0')) stored,
    medico_nombre     text not null default '',
    mercado           text not null,
    cuadrante         text not null default '',     -- evaluación subjetiva (A+, B, C-…)
    notas             text not null default '',
    q1_pacientes_semana   text not null default '',
    q2_pacientes_patologia text not null default '',
    q3_pacientes_producto text not null default '',
    q4_otros_productos    text not null default '',
    q5_costo_consulta     text not null default '',
    cruce_errado      boolean not null default false,
    nombre_fichero    text,
    -- Origen y trazabilidad
    firebase_id       text unique,                  -- ID del documento en Firebase (migración)
    origen_timestamp  text,                         -- "timestamp" original de Firebase
    rol_autor         text,
    creado_por        uuid references public.perfiles (id),
    creado_en         timestamptz not null default now(),
    actualizado_por   uuid references public.perfiles (id),
    actualizado_en    timestamptz not null default now(),
    eliminado_en      timestamptz,
    eliminado_por     uuid references public.perfiles (id)
);
-- Una evaluación activa por visitador + médico + mercado
create unique index evaluaciones_unica_activa
    on public.evaluaciones (visitador_id, matricula_norm, mercado)
    where eliminado_en is null;
create index evaluaciones_matricula_idx on public.evaluaciones (matricula_norm);
create index evaluaciones_actualizado_idx on public.evaluaciones (actualizado_en);

-- Historial: copia de cada versión anterior (para auditar o deshacer)
create table public.evaluaciones_historial (
    id             bigint generated always as identity primary key,
    evaluacion_id  uuid not null,
    accion         text not null,                   -- 'modificada' | 'eliminada' | 'restaurada'
    datos_previos  jsonb not null,
    hecho_por      uuid,
    hecho_en       timestamptz not null default now()
);
create index evaluaciones_historial_eval_idx on public.evaluaciones_historial (evaluacion_id);

create function public.evaluaciones_auditar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    if tg_op = 'INSERT' then
        new.creado_por := coalesce(new.creado_por, auth.uid());
        new.actualizado_por := coalesce(new.actualizado_por, auth.uid());
        return new;
    end if;
    -- UPDATE: guardar la versión anterior antes de cambiarla
    insert into public.evaluaciones_historial (evaluacion_id, accion, datos_previos, hecho_por)
    values (
        old.id,
        case when old.eliminado_en is null and new.eliminado_en is not null then 'eliminada'
             when old.eliminado_en is not null and new.eliminado_en is null then 'restaurada'
             else 'modificada' end,
        to_jsonb(old),
        auth.uid()
    );
    new.actualizado_en := now();
    new.actualizado_por := coalesce(auth.uid(), new.actualizado_por);
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
    new.firebase_id := old.firebase_id;
    if new.eliminado_en is not null and old.eliminado_en is null then
        new.eliminado_por := auth.uid();
    end if;
    return new;
end;
$$;

create trigger evaluaciones_auditar_ins before insert on public.evaluaciones
    for each row execute function public.evaluaciones_auditar();
create trigger evaluaciones_auditar_upd before update on public.evaluaciones
    for each row execute function public.evaluaciones_auditar();

-- ------------------------------------------------------------
-- Configuración COMPARTIDA (antes se guardaba solo en el navegador
-- de quien la cambiaba). La edita el admin; todos la leen.
-- ------------------------------------------------------------
create table public.configuracion (
    clave           text primary key,
    valor           jsonb not null,
    descripcion     text not null default '',
    actualizado_por uuid references public.perfiles (id),
    actualizado_en  timestamptz not null default now()
);
create trigger configuracion_actualizado before update on public.configuracion
    for each row execute function public.marcar_actualizado();

-- Valores iniciales = los que hoy trae la app (js/config.js)
insert into public.configuracion (clave, valor, descripcion) values
('umbrales_matriz',
 '{"TH_LOY_LOW": 33, "TH_LOY_HIGH": 66, "TH_POT_LOW": 33, "TH_POT_HIGH": 66}',
 'Cortes de Adopción (share) y Potencialidad (Pareto) de la matriz, en %'),
('umbrales_encuesta',
 '{"A": 70, "B": 35}',
 'Puntaje mínimo de la encuesta para clasificar A o B'),
('ponderacion_encuesta',
 '{"q1": {"Menos de 10": 5, "10 a 20": 10, "21 a 30": 15, "31 a 40": 20, "41 a 50": 25, "51 a 70": 30, "Más de 70": 35},
   "q2": {"0": 0, "1 a 5": 10, "6 a 10": 15, "11 a 15": 20, "16 a 20": 25, "21 a 30": 30, "31 a 40": 33, "Más de 40": 35},
   "q3": {"0": 0, "1 a 5": 10, "6 a 10": 15, "11 a 15": 20, "16 a 20": 25, "21 a 30": 30, "Más de 30": 35},
   "q5": {"Gratuita / Institucional": 1, "Menos de $30": 2, "$30 a $50": 5, "$51 a $80": 8, "$81 a $120": 10, "$121 a $150": 12, "Más de $150": 15}}',
 'Puntos de cada respuesta de la encuesta'),
('productos_phq',
 '["AIREX PHQ","ALLERFEX PHQ","AMLODIPINA LST LST","AMOXICILINA LST LST","ANALPER NAX LST","ATENOLOL LST LST","ATORVASTATINA LST LST","AZITROMICINA LST LST","BROXOL ALERG LST","BROXOL FLEM LST","BROXOL LST","BROXOL S/ALC-AZUC LST","BUCOXOL GAR LST","BUMETIN RETARD PHQ","CANDESARTAN LST LST","CANDETIQUE PHQ","CARVEDILOL LST LST","CEFADROXILO LST LST","CETIRIZINA LST LST","CIPROFIBRATO LST LST","CIPROFLOXACIN.LST LST","CLARITROMICIN.LST LST","CLINDAMICINA LST LST","DESLER M PHQ","DESLER PHQ","DESLORATADINA LST LST","DICIGEL PHQ","DICLOFENAC PO.LST LST","DOMPERIDONA LST LST","ESCITALOPRAM LST LST","ESOMEPRAZOL LST LST","ESOZ HP PHQ","ESOZ PHQ","EZETIM.+SINVA.LST LST","FEXOFENADINA LST LST","FLUDIL PHQ","FLUOXETINA LST LST","GLUSTAR PHQ","HEDRALIVE LST","IRBESARTAN LST LST","KETOPROFENO LST LST","KLAFENAC PHQ","KLAFENAC RAPILENT PHQ","LEPRIT PHQ","LEVOCETIRIZIN.LST LST","LEVOFLOXACINA LST LST","LEVOSULPIRIDA LST LST","LORACERT PHQ","LOSARTAN LST PHQ","MELOXICAM LST LST","MONTELUKAST LST LST","MONUKAST PHQ","MOXIFLOXACINA LST LST","NIFEDIPINA LST LST","OCAM PROTECT PHQ","OLMESARTAN LST LST","OLMETIQUE PHQ","OMEPRAZOL LST LST","PROLARDI PHQ","PULMOLIX PHQ","ROSUVASTATINA LST LST","SERTRALINA LST LST","SINUX PHQ","SULAMP PHQ","TIOCOL PHQ","TIOCOLFEN PHQ","TRALIX PHQ","TRIMEBUTINA LST LST","VALSARTAN LST LST","XAROX PHQ"]',
 'Productos del laboratorio (se reconocen por coincidencia de texto)'),
('equipos_otc',
 '["7"]',
 'Códigos de "Equipo" del fichero que pertenecen a la línea OTC (el resto = Pharmetique)')
on conflict (clave) do nothing;

-- ------------------------------------------------------------
-- Registro de fallas de la app (js/errores.js las envía aquí)
-- ------------------------------------------------------------
create table public.app_errores (
    id         bigint generated always as identity primary key,
    fecha      timestamptz,
    tipo       text check (char_length(tipo) <= 20),
    mensaje    text check (char_length(mensaje) <= 600),
    detalle    text check (char_length(detalle) <= 2100),
    pantalla   text check (char_length(pantalla) <= 300),
    usuario    text check (char_length(usuario) <= 200),
    entorno    text check (char_length(entorno) <= 20),
    version    text check (char_length(version) <= 20),
    navegador  text check (char_length(navegador) <= 250),
    conexion   text check (char_length(conexion) <= 20),
    recibido_en timestamptz not null default now()
);
create index app_errores_recibido_idx on public.app_errores (recibido_en desc);
