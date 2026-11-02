-- Marca de "recordatorio de visita enviado" (el backend la crea solo si no existe;
-- este archivo queda como referencia).
ALTER TABLE ordenes ADD COLUMN recordatorio_enviado DATETIME NULL DEFAULT NULL;
