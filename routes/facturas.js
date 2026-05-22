var express = require('express');
var router = express.Router();
const db = require('../db'); // 🔥 IMPORTANTE: conexión a MySQL

// Servicios y precios
const servicios = {
  camara: 50000,
  enchufe: 20000,
  alumbrado: 30000,
  puerto: 25000
};

let facturas = [];

// 🔥 FUNCIÓN para crear factura
function crearFacturaDesdeOrden(orden) {
  let total = 0;
  let detalle = [];

  orden.servicios.forEach(servicio => {
    if (servicios[servicio]) {
      total += servicios[servicio];
      detalle.push({
        servicio: servicio,
        precio: servicios[servicio]
      });
    }
  });

  const nuevaFactura = {
    id: facturas.length + 1,
    cliente: orden.cliente,
    detalle: detalle,
    total: total
  };

  facturas.push(nuevaFactura);

  return nuevaFactura;
}

// ===============================
// 📄 GET todas las facturas (MEMORIA)
// ===============================
router.get('/', function(req, res) {
  res.json(facturas);
});

// ===============================
// 🔎 GET factura por ID (MYSQL)
// ===============================
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);

  const query = `
    SELECT 
      f.id,
      f.cliente,
      f.total,
      d.servicio,
      d.precio
    FROM facturas f
    LEFT JOIN detalle_factura d 
      ON f.id = d.factura_id
    WHERE f.id = ?
  `;

  db.query(query, [id], (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: 'Error al obtener factura' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    // 🔥 Construir estructura final
    const factura = {
      id: results[0].id,
      cliente: results[0].cliente,
      total: results[0].total,
      detalle: []
    };

    results.forEach(row => {
      if (row.servicio) {
        factura.detalle.push({
          servicio: row.servicio,
          precio: row.precio
        });
      }
    });

    res.json(factura);
  });
});

// ===============================
module.exports = {
  router,
  crearFacturaDesdeOrden
};