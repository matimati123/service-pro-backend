-- Materiales usados en cada orden (inventario básico)
CREATE TABLE IF NOT EXISTS `materiales_orden` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orden_id` int NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `cantidad` decimal(10,2) NOT NULL,
  `unidad` varchar(20) NOT NULL DEFAULT 'un',
  `costo_unitario` int DEFAULT NULL,
  `notas` varchar(255) DEFAULT NULL,
  `creado_por` varchar(150) DEFAULT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_materiales_orden` (`orden_id`),
  CONSTRAINT `materiales_orden_ibfk_1` FOREIGN KEY (`orden_id`) REFERENCES `ordenes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
