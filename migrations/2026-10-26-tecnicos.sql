-- =============================================
-- Técnicos con especialidades
-- Ejecutar UNA vez en la base de datos (service_pro) ANTES de usar la sección "Técnicos".
-- Es seguro repetirlo: no pisa datos existentes.
-- =============================================

CREATE TABLE IF NOT EXISTS `tecnicos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `telefono` varchar(20) NOT NULL DEFAULT '',
  `especialidades` varchar(100) NOT NULL,          -- ej: 'camara,enchufe,alumbrado'
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tecnico_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Importa los técnicos que ya habías asignado a órdenes (con TODAS las especialidades,
-- para que nada se rompa). Después edita la especialidad real de cada uno en el panel.
INSERT IGNORE INTO `tecnicos` (`nombre`, `email`, `telefono`, `especialidades`)
SELECT MAX(`tecnico_nombre`), LOWER(`tecnico_email`), COALESCE(MAX(`tecnico_telefono`), ''), 'camara,enchufe,alumbrado'
FROM `ordenes`
WHERE `tecnico_email` IS NOT NULL AND `tecnico_email` <> ''
GROUP BY LOWER(`tecnico_email`);
