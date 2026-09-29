-- =============================================
-- VOLTIA PRO SPA — Esquema de Base de Datos
-- Archivo: schema.sql
-- Base de datos: service_pro
-- =============================================

CREATE DATABASE IF NOT EXISTS `service_pro` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `service_pro`;

-- 1. Tabla: usuarios
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `rol` enum('cliente','admin','tecnico') DEFAULT 'cliente',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Tabla: ordenes
CREATE TABLE IF NOT EXISTS `ordenes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente` varchar(100) DEFAULT NULL,
  `direccion` varchar(200) DEFAULT NULL,
  `estado` enum('pendiente','evaluada','rechazada','cotizada','aprobada','completado') NOT NULL,
  `motivo_rechazo` text,
  `observaciones` text,
  `tecnico_nombre` varchar(100) DEFAULT NULL,
  `tecnico_email` varchar(150) DEFAULT NULL,
  `fecha_visita` date DEFAULT NULL,
  `hora_visita` varchar(10) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `usuario_id` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_ordenes_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Tabla: servicios_orden
CREATE TABLE IF NOT EXISTS `servicios_orden` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orden_id` int DEFAULT NULL,
  `servicio` varchar(50) DEFAULT NULL,
  `precio` int DEFAULT NULL,
  `detalle` text,
  PRIMARY KEY (`id`),
  KEY `orden_id` (`orden_id`),
  CONSTRAINT `servicios_orden_ibfk_1` FOREIGN KEY (`orden_id`) REFERENCES `ordenes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Tabla: facturas
CREATE TABLE IF NOT EXISTS `facturas` (
  `id` int NOT NULL AUTO_INCREMENT,
  `cliente` varchar(100) DEFAULT NULL,
  `total` int DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Tabla: detalle_factura
CREATE TABLE IF NOT EXISTS `detalle_factura` (
  `id` int NOT NULL AUTO_INCREMENT,
  `factura_id` int DEFAULT NULL,
  `servicio` varchar(50) DEFAULT NULL,
  `precio` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `factura_id` (`factura_id`),
  CONSTRAINT `detalle_factura_ibfk_1` FOREIGN KEY (`factura_id`) REFERENCES `facturas` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 6. Tabla: mensajes_chatbot
CREATE TABLE IF NOT EXISTS `mensajes_chatbot` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) DEFAULT 'Anónimo',
  `email` varchar(150) DEFAULT NULL,
  `mensaje` text NOT NULL,
  `leido` tinyint(1) DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 7. Tabla: calificaciones
CREATE TABLE IF NOT EXISTS `calificaciones` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orden_id` int NOT NULL,
  `usuario_id` int NOT NULL,
  `estrellas` tinyint NOT NULL,
  `comentario` varchar(500) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_calificacion_orden` (`orden_id`),
  KEY `idx_calificacion_usuario` (`usuario_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
