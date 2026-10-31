-- Limpieza post-migración: cancela comandas abiertas registradas antes del
-- cambio a numeración por turno de caja (folio por caja abierta).
-- Debe ejecutarse UNA VEZ al actualizar el sistema, antes de levantar el stack.

-- Liberar mesas que estaban ocupadas por comandas abiertas.
UPDATE "RestaurantTable"
SET "status" = 'FREE', "occupiedViaQrAt" = NULL
WHERE "id" IN (
  SELECT DISTINCT "tableId"
  FROM "Order"
  WHERE "tableId" IS NOT NULL
    AND "status" <> 'PAID'
    AND "status" <> 'CANCELLED'
);

-- Registrar y aplicar la cancelación de comandas abiertas.
INSERT INTO "OrderStatusHistory" ("orderId", "status", "changedAt", "changedById")
SELECT "id", 'CANCELLED', NOW(), NULL
FROM "Order"
WHERE "status" <> 'PAID'
  AND "status" <> 'CANCELLED';

UPDATE "Order"
SET "status" = 'CANCELLED'
WHERE "status" <> 'PAID'
  AND "status" <> 'CANCELLED';

-- Sanity check (ejecutar y observar 0 filas afectadas):
-- SELECT COUNT(*) FROM "Order" WHERE "status" <> 'PAID' AND "status" <> 'CANCELLED';
