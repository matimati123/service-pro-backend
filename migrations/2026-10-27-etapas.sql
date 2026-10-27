-- Ciclo de vida del proyecto: una fila por orden y etapa (solo se guardan las que se han tocado)
CREATE TABLE IF NOT EXISTS `etapas_orden` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orden_id` int NOT NULL,
  `etapa` varchar(40) NOT NULL,
  `estado` enum('pendiente','en_curso','completada','no_aplica') NOT NULL DEFAULT 'pendiente',
  `fecha` date DEFAULT NULL,
  `responsable` varchar(100) DEFAULT NULL,
  `referencia` varchar(100) DEFAULT NULL,
  `monto` int DEFAULT NULL,
  `notas` text,
  `actualizado_por` varchar(150) DEFAULT NULL,
  `actualizado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_orden_etapa` (`orden_id`,`etapa`),
  CONSTRAINT `etapas_orden_ibfk_1` FOREIGN KEY (`orden_id`) REFERENCES `ordenes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
