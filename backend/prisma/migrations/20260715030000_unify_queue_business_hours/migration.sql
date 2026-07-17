-- Unificación de horarios: Queue.schedule (embebido) -> BusinessHours referenciado por FK.
--
-- Pasos:
--   1. Añadir columna/FK queues.business_hours_id.
--   2. Función auxiliar que convierte el formato legacy {mon:{open,close}} (claves de 3
--      letras, una ventana por día) al canónico {monday:[{start,end}]} (arrays de slots).
--   3. Normalizar filas existentes de business_hours que estén en formato legacy.
--   4. Backfill: por cada cola con schedule, crear un BusinessHours canónico y vincularlo.
--   5. Limpiar la función y eliminar la columna legacy queues.schedule.

-- 1) Nueva columna FK
ALTER TABLE "queues" ADD COLUMN "business_hours_id" TEXT;
ALTER TABLE "queues"
  ADD CONSTRAINT "queues_business_hours_id_fkey"
  FOREIGN KEY ("business_hours_id") REFERENCES "business_hours"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 2) Conversor legacy -> canónico. Devuelve NULL si el origen no es legacy con días.
CREATE OR REPLACE FUNCTION _cortex_convert_schedule(src jsonb) RETURNS jsonb AS $fn$
DECLARE
  days   jsonb;
  result jsonb := '{}'::jsonb;
  m      text[] := ARRAY['mon','monday','tue','tuesday','wed','wednesday','thu','thursday','fri','friday','sat','saturday','sun','sunday'];
  i      int;
  short  text;
  fullday text;
  win    jsonb;
  slots  jsonb;
BEGIN
  IF src IS NULL OR jsonb_typeof(src) <> 'object' THEN
    RETURN NULL;
  END IF;

  IF src ? 'days' AND jsonb_typeof(src->'days') = 'object' THEN
    days := src->'days';
  ELSE
    days := src;
  END IF;

  -- Solo convertir si parece legacy (tiene claves de 3 letras).
  IF NOT (days ? 'mon' OR days ? 'tue' OR days ? 'wed' OR days ? 'thu'
          OR days ? 'fri' OR days ? 'sat' OR days ? 'sun') THEN
    RETURN NULL;
  END IF;

  i := 1;
  WHILE i <= array_length(m, 1) LOOP
    short   := m[i];
    fullday := m[i + 1];
    win     := days -> short;
    IF win IS NOT NULL AND jsonb_typeof(win) = 'object'
       AND COALESCE(win->>'open', '') <> '' AND COALESCE(win->>'close', '') <> '' THEN
      slots := jsonb_build_array(jsonb_build_object('start', win->>'open', 'end', win->>'close'));
    ELSE
      slots := '[]'::jsonb;
    END IF;
    result := result || jsonb_build_object(fullday, slots);
    i := i + 2;
  END LOOP;

  RETURN result;
END;
$fn$ LANGUAGE plpgsql;

-- 3) Normalizar business_hours existentes en formato legacy.
UPDATE "business_hours" bh
SET
  "schedule" = c.converted,
  "timezone" = COALESCE(NULLIF(bh."schedule"->>'timezone', ''), bh."timezone")
FROM (
  SELECT "id", _cortex_convert_schedule("schedule") AS converted
  FROM "business_hours"
) c
WHERE bh."id" = c."id" AND c.converted IS NOT NULL;

-- 4) Backfill de colas -> business_hours + vínculo.
DO $$
DECLARE
  q       RECORD;
  conv    jsonb;
  tz      text;
  bh_id   text;
  bh_name text;
BEGIN
  FOR q IN
    SELECT "id", "name", "schedule"
    FROM "queues"
    WHERE "schedule" IS NOT NULL AND "business_hours_id" IS NULL
  LOOP
    conv := _cortex_convert_schedule(q."schedule");
    IF conv IS NULL THEN
      CONTINUE;
    END IF;

    tz := COALESCE(NULLIF(q."schedule"->>'timezone', ''), 'America/Guayaquil');

    bh_name := 'Horario · ' || q."name";
    IF EXISTS (SELECT 1 FROM "business_hours" WHERE "name" = bh_name) THEN
      bh_name := bh_name || ' (' || left(q."id", 8) || ')';
    END IF;

    bh_id := gen_random_uuid()::text;
    INSERT INTO "business_hours" ("id", "name", "timezone", "schedule", "holidays")
    VALUES (bh_id, bh_name, tz, conv, NULL);

    UPDATE "queues" SET "business_hours_id" = bh_id WHERE "id" = q."id";
  END LOOP;
END $$;

-- 5) Limpieza y eliminación de la columna legacy.
DROP FUNCTION _cortex_convert_schedule(jsonb);
ALTER TABLE "queues" DROP COLUMN "schedule";
