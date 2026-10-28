-- Limpieza de órdenes de prueba (#1 al #20). IRREVERSIBLE: revisa primero el SELECT.
-- Ajusta los números si alguna de esas órdenes es real.

-- PASO 1: revisa qué se va a borrar
SELECT o.id, o.cliente, o.direccion, o.estado, o.monto, o.created_at
FROM ordenes o
WHERE o.id BETWEEN 1 AND 20
ORDER BY o.id;

-- PASO 2: borrar (ejecutar todo junto, con el rayo "Execute all")
START TRANSACTION;
DELETE FROM calificaciones  WHERE orden_id BETWEEN 1 AND 20;
DELETE FROM fotos_orden     WHERE orden_id BETWEEN 1 AND 20;
DELETE FROM servicios_orden WHERE orden_id BETWEEN 1 AND 20;
DELETE FROM ordenes         WHERE id       BETWEEN 1 AND 20;  -- etapas y materiales se borran solos
COMMIT;

-- PASO 3: comprobar (debe mostrar solo #21 en adelante)
SELECT id, cliente, estado FROM ordenes ORDER BY id;
