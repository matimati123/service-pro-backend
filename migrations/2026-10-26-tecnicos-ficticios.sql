-- =============================================
-- Técnicos FICTICIOS para probar (emails @example.com, teléfonos de prueba).
-- Incluye la creación de la tabla `tecnicos`, así que sirve como único script a ejecutar.
-- Seguro de repetir: no duplica técnicos que ya existen.
-- Para borrarlos después:  DELETE FROM tecnicos WHERE email LIKE '%@example.com';
-- =============================================

USE `service_pro`;

CREATE TABLE IF NOT EXISTS `tecnicos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `telefono` varchar(20) NOT NULL DEFAULT '',
  `especialidades` varchar(100) NOT NULL,
  `activo` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tecnico_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `tecnicos` (`nombre`, `email`, `telefono`, `especialidades`, `activo`) VALUES
  ('Carlos Muñoz',     'carlos.munoz@example.com',     '56955550101', 'camara',                   1),  -- solo cámaras
  ('Felipe Araya',     'felipe.araya@example.com',     '56955550102', 'enchufe,alumbrado',        1),  -- enchufes y alumbrado
  ('Javier Soto',      'javier.soto@example.com',      '56955550103', 'alumbrado',                1),  -- solo alumbrado
  ('Diego Contreras',  'diego.contreras@example.com',  '56955550104', 'camara,enchufe,alumbrado', 1),  -- hace todo
  ('Rodrigo Pizarro',  'rodrigo.pizarro@example.com',  '56955550105', 'enchufe',                  1),  -- solo enchufes
  ('Mauricio Vera',    'mauricio.vera@example.com',    '56955550106', 'camara,enchufe',           0);  -- inactivo (ejemplo)
