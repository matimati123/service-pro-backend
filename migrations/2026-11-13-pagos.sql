-- Pagos con Webpay Plus (anticipo de una orden)
-- Ejecutar UNA vez en la base de datos de Aiven (no toca ninguna tabla existente).
CREATE TABLE IF NOT EXISTS `pagos` (
  `id` int NOT NULL AUTO_INCREMENT,
  `orden_id` int NOT NULL,
  `usuario_id` int DEFAULT NULL,
  `tipo` varchar(20) NOT NULL DEFAULT 'anticipo',
  `monto` int NOT NULL,
  `buy_order` varchar(26) NOT NULL,
  `token` varchar(100) DEFAULT NULL,
  `estado` enum('iniciado','pagado','rechazado','anulado') NOT NULL DEFAULT 'iniciado',
  `codigo_autorizacion` varchar(20) DEFAULT NULL,
  `tarjeta_ult4` varchar(4) DEFAULT NULL,
  `tipo_pago` varchar(5) DEFAULT NULL,
  `creado_en` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `pagado_en` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pago_buy_order` (`buy_order`),
  KEY `idx_pago_orden` (`orden_id`),
  KEY `idx_pago_token` (`token`),
  CONSTRAINT `pagos_ibfk_1` FOREIGN KEY (`orden_id`) REFERENCES `ordenes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
