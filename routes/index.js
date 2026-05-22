var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});
// Nueva ruta de prueba
router.get('/test', function(req, res) {
  res.send('Servidor funcionando correctamente');
});

module.exports = router;
