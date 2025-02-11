const express = require("express");
const connection = require("./db");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Inicio

// login

app.post("/api/login", (req, res) => {
  const { usuario, contrasena } = req.body;

  const query = "SELECT * FROM usuarios WHERE usuario = ? AND contrasena = ?";
  connection.query(query, [usuario, contrasena], (error, results) => {
    if (error) {
      console.error("Error en la consulta SQL:", error);
      return res
        .status(500)
        .json({ success: false, message: "Error en el servidor" });
    }

    if (results.length > 0) {
      const user = results[0];

      let redirectRoute = "/";
      if (user.rol_id === 1) {
        redirectRoute = "/main/inicio";
      } else if (user.rol_id === 2) {
        redirectRoute = "/main/ventas";
      }

      res.json({
        success: true,
        id: user.id,
        rol_id: user.rol_id,
        redirectRoute,
      });
    } else {
      res
        .status(401)
        .json({ success: false, message: "Usuario o contrasena incorrectos" });
    }
  });
});

/* Ruta para obtener datos de los usuarios */
app.get("/api/datos-usuarios/:id", (req, res) => {
  const userId = req.params.id;
  const query = `
    SELECT 
        u.id,
        r.nombre AS rol,
        u.nombre,
        u.usuario,
        u.contrasena
    FROM 
        usuarios u
    JOIN 
        rol r ON u.rol_id = r.id
    WHERE 
        u.id = ?;
  `;

  connection.query(query, [userId], (error, results) => {
    if (error) {
      return res
        .status(500)
        .json({ error: "Error al obtener los datos del usuario" });
    }
    res.json(results[0]);
  });
});

/* Balance */
app.get("/inicio/balance", (req, res) => {
  const query = `
    SELECT 
        b.id,
        b.fecha,
        bd.nombre AS detalle,
        b.ingresos,
        b.gastos
    FROM 
        balance b
    JOIN 
        balance_detalle bd
    ON 
        b.detalle_id = bd.id
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Insertar un registro en la tabla balance */
app.post("/balance-agregar", (req, res) => {
  const { fecha, detalle_id = null, ingresos = null, gastos = null } = req.body;

  // Validar que al menos un campo esté presente
  if (!fecha && !detalle_id && ingresos === null && gastos === null) {
    return res
      .status(400)
      .json({ error: "Se requiere al menos un dato para registrar." });
  }

  const query = `
    INSERT INTO balance (fecha, detalle_id, ingresos, gastos) 
    VALUES (?, ?, ?, ?)
  `;

  const values = [fecha || null, detalle_id, ingresos, gastos];

  connection.query(query, values, (error, result) => {
    if (error) {
      console.error("Error al insertar el registro en balance:", error);
      return res.status(500).json({ error: "Error al insertar el registro" });
    }

    res.status(201).json({
      message: "Registro agregado exitosamente",
      id: result.insertId,
    });
  });
});

/* Ruta para obtener los tipos de detalle */
app.get("/api/tipos-detalle", (req, res) => {
  const query = `
    SELECT id, nombre 
    FROM balance_detalle
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error al obtener los tipos de detalle:", error);
      return res
        .status(500)
        .json({ error: "Error al obtener los tipos de detalle" });
    }

    res.status(200).json(results);
  });
});

// Inventario

/* Stock */
app.get("/inventario/stock", (req, res) => {
  const query = `
    SELECT 
      p.codigo,
      pr.nombre AS proveedor,
      s.nombre AS subcategoria,
      p.nombre,
      f.nombre AS formulacion,
      u.nombre AS unidad,
      p.cantidad,
      p.precio_compra
    FROM 
      producto p
    INNER JOIN 
      proveedor pr ON p.proveedor_id = pr.id
    INNER JOIN 
      subcategoria s ON p.subcategoria_id = s.id
    INNER JOIN 
      formulacion f ON p.formulacion_id = f.id
    INNER JOIN 
      unidad u ON p.unidad_id = u.id
    ORDER BY 
      p.codigo ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Stock mínimo */
app.get("/inventario/stock-minimo", (req, res) => {
  const query = `
    SELECT 
      p.codigo,
      pr.nombre AS proveedor,
      s.nombre AS subcategoria,
      p.nombre AS nombre_producto,
      f.nombre AS formulacion,
      u.nombre AS unidad,
      p.cantidad,
      p.precio_compra
    FROM 
      producto p
    INNER JOIN 
      proveedor pr ON p.proveedor_id = pr.id
    INNER JOIN 
      subcategoria s ON p.subcategoria_id = s.id
    INNER JOIN 
      formulacion f ON p.formulacion_id = f.id
    INNER JOIN 
      unidad u ON p.unidad_id = u.id
    WHERE 
      p.cantidad <= p.stock_minimo 
      AND p.estado_id = 1
      AND p.elaborado_id = 1
    ORDER BY 
      p.codigo ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* stock minimo, ruta para el boton de enviar pedido */
app.post("/inventario/enviar-pedido", (req, res) => {
  const { codigos, estado_id } = req.body;

  // Verificar que se envíen los códigos y el estado_id
  if (
    !Array.isArray(codigos) ||
    codigos.length === 0 ||
    typeof estado_id !== "number"
  ) {
    return res.status(400).json({
      error: "Debe proporcionar un array de códigos y un estado_id válido.",
    });
  }

  // Construir la consulta para actualizar múltiples códigos
  const query = `
    UPDATE producto
    SET estado_id = ?
    WHERE codigo IN (${codigos.map(() => "?").join(",")})
  `;

  // Combinar los valores para la consulta
  const values = [estado_id, ...codigos];

  // Ejecutar la consulta
  connection.query(query, values, (error, results) => {
    if (error) {
      return res
        .status(500)
        .json({ error: "Error al actualizar los productos", details: error });
    }

    res.json({
      message: "El estado de los productos se actualizó correctamente.",
      affectedRows: results.affectedRows,
    });
  });
});

/* Lista de precios */
app.get("/inventario/lista-precios", (req, res) => {
  const query = `
    SELECT 
      p.codigo,
      pr.nombre AS proveedor,
      s.nombre AS subcategoria,
      p.nombre AS nombre_producto,
      f.nombre AS formulacion,
      u.nombre AS unidad,
      p.cantidad,
      p.precio_venta  -- Cambiado de precio_compra a precio_venta
    FROM 
      producto p
    INNER JOIN 
      proveedor pr ON p.proveedor_id = pr.id
    INNER JOIN 
      subcategoria s ON p.subcategoria_id = s.id
    INNER JOIN 
      formulacion f ON p.formulacion_id = f.id
    INNER JOIN 
      unidad u ON p.unidad_id = u.id
    ORDER BY 
      p.codigo ASC`;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

// Producto

/* Obtener todos los productos con los nombres correspondientes */
app.get("/producto", (req, res) => {
  const query = `
    SELECT 
        p.codigo,
        p.fecha_vencimiento,
        c.nombre AS categoria, 
        s.nombre AS subcategoria, 
        p.nombre AS nombre, 
        f.nombre AS formulacion, 
        u.nombre AS unidad, 
        p.cantidad, 
        p.precio_compra, 
        p.precio_venta, 
        p.stock_minimo, 
        e.nombre AS estado,
        el.nombre AS elaborado,
        pr.nombre AS proveedor, 
        t.nombre AS transportador
    FROM 
        producto p
    JOIN 
        categoria c ON p.categoria_id = c.id
    JOIN 
        subcategoria s ON p.subcategoria_id = s.id
    JOIN 
        formulacion f ON p.formulacion_id = f.id
    JOIN 
        unidad u ON p.unidad_id = u.id
    JOIN 
        estado e ON p.estado_id = e.id
    JOIN 
        elaborado el ON p.elaborado_id = el.id
    JOIN 
        proveedor pr ON p.proveedor_id = pr.id
    JOIN 
        transportador t ON p.transportador_id = t.id
    ORDER BY 
      p.categoria_id ASC, p.subcategoria_id ASC, p.codigo ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

/* Agregar un producto */
app.post("/producto-agregar", (req, res) => {
  const nuevoProducto = req.body;

  const query = `
    INSERT INTO producto (categoria_id, subcategoria_id, fecha_vencimiento, nombre, formulacion_id, unidad_id, cantidad, precio_compra, precio_venta, stock_minimo, estado_id, proveedor_id, transportador_id, elaborado_id) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    nuevoProducto.categoria_id,
    nuevoProducto.subcategoria_id,
    nuevoProducto.fecha_vencimiento,
    nuevoProducto.nombre,
    nuevoProducto.formulacion_id,
    nuevoProducto.unidad_id,
    nuevoProducto.cantidad,
    nuevoProducto.precio_compra,
    nuevoProducto.precio_venta,
    nuevoProducto.stock_minimo,
    nuevoProducto.estado_id,
    nuevoProducto.proveedor_id,
    nuevoProducto.transportador_id,
    nuevoProducto.elaborado_id,
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      console.error("Error al agregar el producto:", error);
      return res.status(500).json({ error: "Error al agregar el producto" });
    }
    res.status(201).json({ id: result.insertId, ...nuevoProducto });
  });
});

/* Modificar un producto */
app.put("/producto-modificar/:codigo", (req, res) => {
  const { codigo } = req.params; // Usamos 'codigo' como parámetro para identificar el producto
  const updatedData = req.body;

  if (!codigo) {
    return res
      .status(400)
      .json({ message: "El código del producto es requerido" });
  }

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.categoria_id) {
    setClause.push("categoria_id = ?");
    values.push(updatedData.categoria_id);
  }
  if (updatedData.subcategoria_id) {
    setClause.push("subcategoria_id = ?");
    values.push(updatedData.subcategoria_id);
  }
  if (updatedData.fecha_vencimiento) {
    setClause.push("fecha_vencimiento = ?");
    values.push(updatedData.fecha_vencimiento);
  }
  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }
  if (updatedData.formulacion_id) {
    setClause.push("formulacion_id = ?");
    values.push(updatedData.formulacion_id);
  }
  if (updatedData.unidad_id) {
    setClause.push("unidad_id = ?");
    values.push(updatedData.unidad_id);
  }
  if (updatedData.cantidad) {
    setClause.push("cantidad = ?");
    values.push(updatedData.cantidad);
  }
  if (updatedData.precio_compra) {
    setClause.push("precio_compra = ?");
    values.push(updatedData.precio_compra);
  }
  if (updatedData.precio_venta) {
    setClause.push("precio_venta = ?");
    values.push(updatedData.precio_venta);
  }
  if (updatedData.stock_minimo) {
    setClause.push("stock_minimo = ?");
    values.push(updatedData.stock_minimo);
  }
  if (updatedData.estado_id) {
    setClause.push("estado_id = ?");
    values.push(updatedData.estado_id);
  }
  if (updatedData.proveedor_id) {
    setClause.push("proveedor_id = ?");
    values.push(updatedData.proveedor_id);
  }
  if (updatedData.transportador_id) {
    setClause.push("transportador_id = ?");
    values.push(updatedData.transportador_id);
  }
  if (updatedData.elaborado_id) {
    setClause.push("elaborado_id = ?");
    values.push(updatedData.elaborado_id);
  }

  values.push(codigo); // Agregamos el código al final de los valores

  const query = `UPDATE producto SET ${setClause.join(", ")} WHERE codigo = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    res.json({ message: "Producto modificado correctamente" });
  });
});

/* Eliminar un producto */
app.delete("/producto-eliminar/:codigo", (req, res) => {
  const codigo = req.params.codigo;

  const query = "DELETE FROM producto WHERE codigo = ?";

  connection.query(query, [codigo], (error, result) => {
    if (error) {
      console.error("Error al eliminar el producto:", error);
      return res.status(500).json({ error: "Error al eliminar el producto" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Producto no encontrado" });
    }
    res.status(200).json({ message: "Producto eliminado correctamente" });
  });
});

// Fecha vencimiento
// Ruta para obtener productos ya vencidos, ordenados cronológicamente
app.get("/inventario/productos-vencidos", (req, res) => {
  const query = `
    SELECT 
        DATE(fecha_vencimiento) AS fecha_vencimiento,  -- Aseguramos el formato DATE
        codigo,
        proveedor.nombre AS proveedor,
        subcategoria.nombre AS subcategoria,
        producto.nombre AS nombre,
        formulacion.nombre AS formulacion,
        unidad.nombre AS unidad,
        cantidad,
        precio_compra,
        (cantidad * precio_compra) AS total
    FROM 
        producto
    JOIN 
        proveedor ON producto.proveedor_id = proveedor.id
    JOIN 
        subcategoria ON producto.subcategoria_id = subcategoria.id
    JOIN 
        formulacion ON producto.formulacion_id = formulacion.id
    JOIN 
        unidad ON producto.unidad_id = unidad.id
    WHERE 
        fecha_vencimiento < CURDATE()  -- Solo productos ya vencidos
    ORDER BY 
        DATE(fecha_vencimiento) ASC;  -- Ordena cronológicamente por fecha de vencimiento
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error al obtener productos vencidos:", error);
      return res
        .status(500)
        .json({ error: "Error en la consulta de productos vencidos" });
    }
    res.json(results);
  });
});

// Obtener productos próximos a vencer en los próximos 3 meses
app.get("/inventario/productos-proximos-vencer", (req, res) => {
  const query = `
    SELECT 
        DATE(fecha_vencimiento) AS fecha_vencimiento,  -- Aseguramos el formato DATE
        codigo,
        proveedor.nombre AS proveedor,
        subcategoria.nombre AS subcategoria,
        producto.nombre AS nombre,
        formulacion.nombre AS formulacion,
        unidad.nombre AS unidad,
        cantidad,
        precio_compra,
        (cantidad * precio_compra) AS total
    FROM 
        producto
    JOIN 
        proveedor ON producto.proveedor_id = proveedor.id
    JOIN 
        subcategoria ON producto.subcategoria_id = subcategoria.id
    JOIN 
        formulacion ON producto.formulacion_id = formulacion.id
    JOIN 
        unidad ON producto.unidad_id = unidad.id
    WHERE 
        fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 3 MONTH)
    ORDER BY 
        DATE(fecha_vencimiento) ASC;  -- Ordena cronológicamente por fecha de vencimiento
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error al obtener productos próximos a vencer:", error);
      return res
        .status(500)
        .json({ error: "Error en la consulta de productos próximos a vencer" });
    }
    res.json(results);
  });
});

// Elaborar producto
/* Obtener prodcutos para vista de busqueda */
app.get("/inventario/elaborar-busqueda", (req, res) => {
  const query = `
    SELECT 
      p.codigo,
      pr.id AS proveedor_id,
      pr.nombre AS proveedor,
      s.id AS subcategoria_id,
      s.nombre AS subcategoria,
      f.id AS formulacion_id,
      f.nombre AS formulacion,
      u.id AS unidad_id,
      u.nombre AS unidad,
      p.nombre,
      p.cantidad,
      p.precio_venta
    FROM 
      producto p
    INNER JOIN 
      proveedor pr ON p.proveedor_id = pr.id
    INNER JOIN 
      subcategoria s ON p.subcategoria_id = s.id
    INNER JOIN 
      formulacion f ON p.formulacion_id = f.id
    INNER JOIN 
      unidad u ON p.unidad_id = u.id
    WHERE
      p.elaborado_id = 1  -- Filtrar productos donde elaborado_id sea igual a 1
    ORDER BY 
      p.codigo ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Ruta para elaborar un producto */
app.put("/inventario/elaborar-agregar", (req, res) => {
  const { nombre, cantidadDestino, elaboracionDestino } = req.body;

  // Incrementar la cantidad en el producto destino usando `nombre` y el estado de elaboración destino
  const queryIncrementar = `
    UPDATE producto 
    SET cantidad = cantidad + ? 
    WHERE nombre = ? 
      AND elaborado_id = (SELECT id FROM elaborado WHERE nombre = ?)
  `;

  // Restar 1 unidad al producto de origen usando `nombre` y `elaborado_id = 1` (siempre como "no")
  const queryRestarUno = `
    UPDATE producto 
    SET cantidad = cantidad - 1 
    WHERE nombre = ? 
      AND elaborado_id = 1
  `;

  connection.beginTransaction((error) => {
    if (error) {
      return res.status(500).json({ error: "Error al iniciar la transacción" });
    }

    // Incrementar cantidad en el producto destino
    connection.query(
      queryIncrementar,
      [cantidadDestino, nombre, elaboracionDestino],
      (error, result) => {
        if (error) {
          return connection.rollback(() => {
            console.error(
              "Error al incrementar cantidad en el producto destino:",
              error
            );
            res.status(500).json({
              error: "Error al incrementar la cantidad en el destino",
            });
          });
        }

        // Restar 1 unidad en el producto de origen
        connection.query(queryRestarUno, [nombre], (error, result) => {
          if (error) {
            return connection.rollback(() => {
              console.error(
                "Error al restar 1 unidad en el producto de origen:",
                error
              );
              res
                .status(500)
                .json({ error: "Error al restar 1 unidad en el origen" });
            });
          }

          // Confirmar la transacción
          connection.commit((error) => {
            if (error) {
              return connection.rollback(() => {
                console.error("Error al confirmar la transacción:", error);
                res
                  .status(500)
                  .json({ error: "Error al confirmar la transacción" });
              });
            }
            res
              .status(200)
              .json({ message: "Elaboración completada exitosamente" });
          });
        });
      }
    );
  });
});

/* Obtener productos no elaborados para vista de búsqueda en ventas */
app.get("/inventario/elaborar-registro", (req, res) => {
  const query = `
    SELECT 
      p.codigo,
      pr.id AS proveedor_id,
      pr.nombre AS proveedor,
      s.id AS subcategoria_id,
      s.nombre AS subcategoria,
      f.id AS formulacion_id,
      f.nombre AS formulacion,
      u.id AS unidad_id,
      u.nombre AS unidad,
      p.nombre,
      p.cantidad,
      p.precio_venta
    FROM 
      producto p
    INNER JOIN 
      proveedor pr ON p.proveedor_id = pr.id
    INNER JOIN 
      subcategoria s ON p.subcategoria_id = s.id
    INNER JOIN 
      formulacion f ON p.formulacion_id = f.id
    INNER JOIN 
      unidad u ON p.unidad_id = u.id
    INNER JOIN 
      elaborado el ON p.elaborado_id = el.id
    WHERE 
      el.nombre != 'no'
    ORDER BY 
      p.codigo ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Ruta para obtener subcategorías por categoria_id */
app.get("/producto/subcategoria-filtro", (req, res) => {
  const categoriaId = req.query.categoria_id;

  if (!categoriaId) {
    return res.status(400).json({ error: "Se requiere categoria_id" });
  }

  const query = "SELECT id, nombre FROM subcategoria WHERE categoria_id = ?";
  connection.query(query, [categoriaId], (error, results) => {
    if (error) {
      console.error("Error al obtener subcategorías:", error);
      return res.status(500).json({ error: "Error al obtener subcategorías" });
    }
    res.json(results);
  });
});

/* Obtener las categorías */
app.get("/producto/categoria", (req, res) => {
  const query = `
    SELECT id, nombre
    FROM categoria`;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

/* Agregar una categoría */
app.post("/producto/categoria-agregar", (req, res) => {
  const nuevaCategoria = req.body;

  const query = `
    INSERT INTO categoria (nombre) 
    VALUES (?)`;

  const values = [nuevaCategoria.nombre];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevaCategoria });
  });
});

/* Modificar una categoría */
app.put("/producto/categoria-modificar/:id", (req, res) => {
  const { id } = req.params; // Asumimos que 'id' es el identificador de la categoría
  const updatedData = req.body;

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }

  values.push(id);

  const query = `UPDATE categoria SET ${setClause.join(", ")} WHERE id = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    res.json({ message: "Categoría modificada correctamente" });
  });
});

/* Eliminar una categoría por ID */
app.delete("/producto/categoria-eliminar/:id", (req, res) => {
  const id = req.params.id; // Usamos 'id' como parámetro para identificar la categoría

  const query = "DELETE FROM categoria WHERE id = ?";

  connection.query(query, [id], (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Categoría no encontrada" });
    }
    res.status(200).json({ message: "Categoría eliminada correctamente" });
  });
});

/* Obtener las subcategorías */
app.get("/producto/subcategoria", (req, res) => {
  const query = `
  SELECT s.id, c.nombre AS categoria_id, s.nombre AS subcategoria_nombre
  FROM subcategoria s
  JOIN categoria c ON s.categoria_id = c.id
  ORDER BY s.categoria_id ASC, s.id ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

/* Agregar una subcategoría */
app.post("/producto/subcategoria-agregar", (req, res) => {
  const nuevaSubcategoria = req.body;

  const query = `
    INSERT INTO subcategoria (nombre, categoria_id) 
    VALUES (?, ?)`;

  const values = [
    nuevaSubcategoria.nombre,
    nuevaSubcategoria.categoria_id, // Asegúrate de enviar el ID de la categoría al agregar la subcategoría
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevaSubcategoria });
  });
});

/* Modificar una subcategoría */
app.put("/producto/subcategoria-modificar/:id", (req, res) => {
  const { id } = req.params; // Asumimos que 'id' es el identificador de la subcategoría
  const updatedData = req.body;

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }

  if (updatedData.categoria_id) {
    setClause.push("categoria_id = ?");
    values.push(updatedData.categoria_id);
  }

  values.push(id);

  const query = `UPDATE subcategoria SET ${setClause.join(", ")} WHERE id = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Subcategoría no encontrada" });
    }
    res.json({ message: "Subcategoría modificada correctamente" });
  });
});

/* Eliminar una subcategoría por ID */
app.delete("/producto/subcategoria-eliminar/:id", (req, res) => {
  const id = req.params.id; // Usamos 'id' como parámetro para identificar la subcategoría

  const query = "DELETE FROM subcategoria WHERE id = ?";

  connection.query(query, [id], (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Subcategoría no encontrada" });
    }
    res.status(200).json({ message: "Subcategoría eliminada correctamente" });
  });
});

/* Obtener las formulaciones */
app.get("/producto/formulacion", (req, res) => {
  const query = `
  SELECT id, nombre
  FROM formulacion
  ORDER BY id ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

/* Agregar una formulación */
app.post("/producto/formulacion-agregar", (req, res) => {
  const nuevaFormulacion = req.body;

  const query = `
    INSERT INTO formulacion (nombre) 
    VALUES (?)`;

  const values = [
    nuevaFormulacion.nombre, // Asegúrate de enviar el nombre al agregar la formulación
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevaFormulacion });
  });
});

/* Modificar una formulación */
app.put("/producto/formulacion-modificar/:id", (req, res) => {
  const { id } = req.params; // Asumimos que 'id' es el identificador de la formulación
  const updatedData = req.body;

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }

  values.push(id);

  const query = `UPDATE formulacion SET ${setClause.join(", ")} WHERE id = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Formulación no encontrada" });
    }
    res.json({ message: "Formulación modificada correctamente" });
  });
});

/* Eliminar una formulación por ID */
app.delete("/producto/formulacion-eliminar/:id", (req, res) => {
  const id = req.params.id; // Usamos 'id' como parámetro para identificar la formulación

  const query = "DELETE FROM formulacion WHERE id = ?";

  connection.query(query, [id], (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Formulación no encontrada" });
    }
    res.status(200).json({ message: "Formulación eliminada correctamente" });
  });
});

/* Obtener las unidades */
app.get("/producto/unidad", (req, res) => {
  const query = `
  SELECT id, nombre
  FROM unidad
  ORDER BY id ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

/* Agregar una unidad */
app.post("/producto/unidad-agregar", (req, res) => {
  const nuevaUnidad = req.body;

  const query = `
    INSERT INTO unidad (nombre) 
    VALUES (?)`;

  const values = [
    nuevaUnidad.nombre, // Asegúrate de enviar el nombre al agregar la unidad
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevaUnidad });
  });
});

/* Modificar una unidad */
app.put("/producto/unidad-modificar/:id", (req, res) => {
  const { id } = req.params; // Asumimos que 'id' es el identificador de la unidad
  const updatedData = req.body;

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }

  values.push(id);

  const query = `UPDATE unidad SET ${setClause.join(", ")} WHERE id = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Unidad no encontrada" });
    }
    res.json({ message: "Unidad modificada correctamente" });
  });
});

/* Eliminar una unidad por ID */
app.delete("/producto/unidad-eliminar/:id", (req, res) => {
  const id = req.params.id; // Usamos 'id' como parámetro para identificar la unidad

  const query = "DELETE FROM unidad WHERE id = ?";

  connection.query(query, [id], (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Unidad no encontrada" });
    }
    res.status(200).json({ message: "Unidad eliminada correctamente" });
  });
});

/* Obtener los estados */
app.get("/producto/estado", (req, res) => {
  const query = `
  SELECT id, nombre
  FROM estado
  ORDER BY id ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

/* Agregar un estado */
app.post("/producto/estado-agregar", (req, res) => {
  const nuevoEstado = req.body;

  const query = `
    INSERT INTO estado (nombre) 
    VALUES (?)`;

  const values = [
    nuevoEstado.nombre, // Asegúrate de enviar el nombre al agregar el estado
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevoEstado });
  });
});

/* Modificar un estado */
app.put("/producto/estado-modificar/:id", (req, res) => {
  const { id } = req.params; // Asumimos que 'id' es el identificador del estado
  const updatedData = req.body;

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }

  values.push(id);

  const query = `UPDATE estado SET ${setClause.join(", ")} WHERE id = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Estado no encontrado" });
    }
    res.json({ message: "Estado modificado correctamente" });
  });
});

/* Eliminar un estado por ID */
app.delete("/producto/estado-eliminar/:id", (req, res) => {
  const id = req.params.id;

  const query = "DELETE FROM estado WHERE id = ?";

  connection.query(query, [id], (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Estado no encontrado" });
    }
    res.status(200).json({ message: "Estado eliminado correctamente" });
  });
});

/* Obtener los elaborados */
app.get("/producto/elaborado", (req, res) => {
  const query = `
  SELECT id, nombre
  FROM elaborado
  ORDER BY id ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      return res.status(500).json({ error: "Database query failed" });
    }
    res.json(results);
  });
});

/* Agregar un elaborado */
app.post("/producto/elaborado-agregar", (req, res) => {
  const nuevoElaborado = req.body;

  const query = `
    INSERT INTO elaborado (nombre) 
    VALUES (?)`;

  const values = [
    nuevoElaborado.nombre, // Asegúrate de enviar el nombre al agregar el elaborado
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevoElaborado });
  });
});

/* Modificar un elaborado */
app.put("/producto/elaborado-modificar/:id", (req, res) => {
  const { id } = req.params; // Asumimos que 'id' es el identificador del elaborado
  const updatedData = req.body;

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }

  values.push(id);

  const query = `UPDATE elaborado SET ${setClause.join(", ")} WHERE id = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Elaborado no encontrado" });
    }
    res.json({ message: "Elaborado modificado correctamente" });
  });
});

/* Eliminar un elaborado por ID */
app.delete("/producto/elaborado-eliminar/:id", (req, res) => {
  const id = req.params.id; // Usamos 'id' como parámetro para identificar el elaborado

  const query = "DELETE FROM elaborado WHERE id = ?";

  connection.query(query, [id], (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Elaborado no encontrado" });
    }
    res.status(200).json({ message: "Elaborado eliminado correctamente" });
  });
});

// Pedidos

/* ruta para buscar un producto en la base de datos para agregarlo */
app.get("/pedido/busqueda-pedido", (__req, res) => {
  const query = `
    SELECT 
    p.codigo,
    pr.nombre AS proveedor,
    s.nombre AS subcategoria,
    p.nombre,
    f.nombre AS formulacion,
    u.nombre AS unidad,
    p.cantidad,
    p.precio_compra,
    p.estado_id 
  FROM 
    producto p
  INNER JOIN 
    proveedor pr ON p.proveedor_id = pr.id
  INNER JOIN 
    subcategoria s ON p.subcategoria_id = s.id
  INNER JOIN 
    formulacion f ON p.formulacion_id = f.id
  INNER JOIN 
    unidad u ON p.unidad_id = u.id
  WHERE
    p.elaborado_id = 1
  ORDER BY 
    p.codigo ASC;

  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Cambiar estado a 1 */
app.post("/inventario/cambiar-estado", (req, res) => {
  const { codigo } = req.body;
  if (!codigo) {
    return res
      .status(400)
      .json({ error: "Debe proporcionar un código válido." });
  }
  const query = `
    UPDATE producto
    SET estado_id = 1
    WHERE codigo = ?
  `;

  connection.query(query, [codigo], (error, results) => {
    if (error) {
      return res
        .status(500)
        .json({ error: "Error al actualizar el producto.", details: error });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({
        error: "No se encontró un producto con el código proporcionado.",
      });
    }

    res.json({
      message: "El estado del producto se actualizó correctamente.",
      affectedRows: results.affectedRows,
    });
  });
});

/* ruta para selecionar el metodo de pago */
app.get("/compra/metodo-pago", (req, res) => {
  const query = "SELECT nombre FROM forma_pago";

  connection.query(query, (err, results) => {
    if (err) {
      console.error("Error al obtener las formas de pago: ", err);
      return res.status(500).send("Error al obtener las formas de pago");
    }
    res.json(results);
  });
});

/* Método para cambiar el estado de un producto que no está en stock a estado de pedido */
app.post("/pedido/id-producto-manual", (req, res) => {
  const productos = req.body.productos;

  /* Verificar si los productos enviados son válidos */
  if (!Array.isArray(productos) || productos.length === 0) {
    return res
      .status(400)
      .json({ message: "No se proporcionaron productos válidos." });
  }

  /* Actualizamos los productos cuyo estado_id es 1 a estado_id = 2 */
  const sql =
    "UPDATE producto SET estado_id = 2 WHERE codigo IN (?) AND estado_id = 1";

  connection.query(sql, [productos], (error, results) => {
    if (error) {
      console.error("Error al actualizar los productos:", error);
      return res
        .status(500)
        .json({ message: "Error al actualizar los productos." });
    }
    res.json({ message: "Productos actualizados exitosamente." });
  });
});

/* Agregar un envío */
app.post("/pedido/envios-agregar", (req, res) => {
  const nuevoEnvio = req.body;

  // Validar los datos recibidos
  if (
    !nuevoEnvio.transportador_id ||
    !nuevoEnvio.kilos ||
    !nuevoEnvio.precio_kilo ||
    !nuevoEnvio.total_cajas
  ) {
    console.error("Datos incompletos para agregar un envío:", nuevoEnvio);
    return res.status(400).json({
      error:
        "Todos los campos son obligatorios (transportador_id, kilos, precio_kilo, total_cajas).",
    });
  }

  // Query de inserción
  const query = `
    INSERT INTO envios (transportador_id, kilos, precio_kilo, total_cajas) 
    VALUES (?, ?, ?, ?)
  `;

  // Valores a insertar
  const values = [
    nuevoEnvio.transportador_id,
    nuevoEnvio.kilos,
    nuevoEnvio.precio_kilo,
    nuevoEnvio.total_cajas,
  ];

  // Ejecutar la consulta
  connection.query(query, values, (error, result) => {
    if (error) {
      console.error("Error al agregar el envío:", error);
      return res.status(500).json({ error: "Error al agregar el envío." });
    }

    // Responder con el ID del nuevo envío
    res.status(201).json({ id: result.insertId, ...nuevoEnvio });
  });
});

// Compras

app.post("/compras/compra-completa", (req, res) => {
  const {
    envio_id,
    transportador_id,
    kilos,
    precio_kilo,
    total_cajas,
    proveedores,
  } = req.body;

  if (envio_id) {
    // Si el envio_id ya existe, procesar directamente los proveedores
    console.log(`Usando envio_id existente: ${envio_id}`);
    procesarProveedores(envio_id, proveedores, res);
  } else {
    // Si no hay envio_id, insertar un nuevo envío
    const queryEnvio = `
      INSERT INTO envios (transportador_id, kilos, precio_kilo, total_cajas) 
      VALUES (?, ?, ?, ?);
    `;
    const envioValues = [transportador_id, kilos, precio_kilo, total_cajas];

    connection.query(queryEnvio, envioValues, (error, envioResult) => {
      if (error) {
        console.error("Error al insertar en envios:", error);
        return res.status(500).json({ error: "Error al registrar el envío" });
      }

      const nuevoEnvioId = envioResult.insertId; // ID del envío recién creado
      console.log(`Nuevo envío registrado con ID: ${nuevoEnvioId}`);
      procesarProveedores(nuevoEnvioId, proveedores, res);
    });
  }
});

// Función para procesar proveedores
function procesarProveedores(envio_id, proveedores, res) {
  const proveedorPromises = proveedores.map((proveedor) => {
    return new Promise((resolve, reject) => {
      const queryCompraGeneral = `
        INSERT INTO compra_general (envio_id, fecha, proveedor_id, forma_pago_id) 
        VALUES (?, ?, ?, ?);
      `;
      const compraGeneralValues = [
        envio_id,
        proveedor.fecha,
        proveedor.proveedor_id,
        proveedor.forma_pago_id,
      ];

      connection.query(
        queryCompraGeneral,
        compraGeneralValues,
        (error, compraResult) => {
          if (error) {
            console.error("Error al insertar en compra_general:", error);
            return reject(error);
          }

          const compraId = compraResult.insertId; // ID de la compra general recién insertada
          console.log(`Compra registrada con ID: ${compraId}`);

          // Si forma_pago_id es 2, insertar en creditos_compras
          if (proveedor.forma_pago_id === 2) {
            const queryCreditosCompras = `
            INSERT INTO creditos_compras (compra_general_id, fecha, proveedor_id, abono_inicial, abono, total_a_pagar) 
            VALUES (?, ?, ?, ?, ?, ?);
          `;
            const creditosValues = [
              compraId,
              proveedor.fecha,
              proveedor.proveedor_id,
              proveedor.abono_inicial || 0,
              0, // Abono inicial predeterminado
              proveedor.total_a_pagar || 0,
            ];

            connection.query(queryCreditosCompras, creditosValues, (error) => {
              if (error) {
                console.error("Error al insertar en creditos_compras:", error);
                return reject(error);
              }
            });
          }

          // Inserta los productos en compra_detalle
          const queryCompraDetalle = `
          INSERT INTO compra_detalle (compra_id, producto_codigo, subcategoria_id, formulacion_id, unidad_id, cantidad, precio_unitario) 
          VALUES (?, ?, ?, ?, ?, ?, ?);
        `;
          const detallePromises = proveedor.productos.map((producto) => {
            return new Promise((resolve, reject) => {
              connection.query(
                queryCompraDetalle,
                [
                  compraId,
                  producto.producto_codigo,
                  producto.subcategoria_id,
                  producto.formulacion_id,
                  producto.unidad_id,
                  producto.cantidad,
                  producto.precio_unitario,
                ],
                (error) => {
                  if (error) {
                    console.error(
                      "Error al insertar en compra_detalle:",
                      error
                    );
                    return reject(error);
                  }
                  resolve();
                }
              );
            });
          });

          // Espera a que se completen todos los detalles
          Promise.all(detallePromises).then(resolve).catch(reject);
        }
      );
    });
  });

  // Espera a que se completen todos los proveedores
  Promise.all(proveedorPromises)
    .then(() => {
      res.status(201).json({
        message: "Envío y compras completas registradas exitosamente",
        envio_id,
      });
    })
    .catch((error) => {
      console.error("Error al procesar proveedores:", error);
      res
        .status(500)
        .json({ error: "Error al registrar las compras completas" });
    });
}

// Ruta para agregar un crédito de compra
app.post("/compras/creditos/agregar", (req, res) => {
  const {
    compra_general_id,
    fecha,
    proveedor_id,
    abono_inicial,
    abono,
    total_a_pagar,
  } = req.body;

  const queryCreditosCompras = `
    INSERT INTO creditos_compras (compra_general_id, fecha, proveedor_id, abono_inicial, abono, total_a_pagar) 
    VALUES (?, ?, ?, ?, ?, ?);
  `;

  const values = [
    compra_general_id,
    fecha,
    proveedor_id,
    abono_inicial,
    abono,
    total_a_pagar,
  ];

  connection.query(queryCreditosCompras, values, (error, result) => {
    if (error) {
      console.error("Error al insertar en creditos_compras:", error);
      return res
        .status(500)
        .json({ error: "Error al registrar el crédito de compra" });
    }

    res.status(201).json({
      message: "Crédito de compra registrado exitosamente",
      credito_id: result.insertId,
    });
  });
});

/*  ruta para obtener los detalles de las compras */
app.get("/compras/compra-detalle-vista", (req, res) => {
  const query = `
    SELECT 
      cd.id,
      cd.compra_id,
      cg.fecha,
      p.nombre AS proveedor,
      cg.proveedor_id AS proveedor_id, -- ID del proveedor
      cd.producto_codigo,
      prod.nombre AS producto_nombre,
      f.nombre AS formulacion_nombre,
      u.nombre AS unidad_nombre,
      cd.cantidad,
      cd.precio_unitario,
      cd.subtotal
    FROM 
      compra_detalle cd
    JOIN 
      compra_general cg ON cd.compra_id = cg.id
    JOIN 
      proveedor p ON cg.proveedor_id = p.id
    JOIN 
      producto prod ON cd.producto_codigo = prod.codigo
    JOIN 
      formulacion f ON cd.formulacion_id = f.id
    JOIN 
      unidad u ON cd.unidad_id = u.id
    ORDER BY 
      cg.fecha DESC, cd.id DESC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

// Ventas

/* Obtener ventas para vista de busqueda */
app.get("/inventario/ventas-busqueda", (req, res) => {
  const query = `
    SELECT 
      p.codigo,
      pr.id AS proveedor_id,
      pr.nombre AS proveedor,
      s.id AS subcategoria_id,
      s.nombre AS subcategoria,
      f.id AS formulacion_id,
      f.nombre AS formulacion,
      u.id AS unidad_id,
      u.nombre AS unidad,
      p.nombre,
      p.cantidad,
      p.precio_venta
    FROM 
      producto p
    INNER JOIN 
      proveedor pr ON p.proveedor_id = pr.id
    INNER JOIN 
      subcategoria s ON p.subcategoria_id = s.id
    INNER JOIN 
      formulacion f ON p.formulacion_id = f.id
    INNER JOIN 
      unidad u ON p.unidad_id = u.id
    ORDER BY 
      p.codigo ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

// Ruta para agregar venta general, detalles y actualizar inventario
app.post("/ventas/venta-completa", (req, res) => {
  const {
    fecha,
    cliente_id,
    forma_pago_id,
    abono_inicial,
    total_a_pagar,
    productos,
  } = req.body;

  // Inserta en venta_general
  const queryVentaGeneral = `
    INSERT INTO venta_general (fecha, cliente_id, forma_pago_id) 
    VALUES (?, ?, ?);
  `;

  connection.query(
    queryVentaGeneral,
    [fecha, cliente_id, forma_pago_id],
    (error, results) => {
      if (error) {
        console.error("Error al insertar en venta_general:", error);
        return res
          .status(500)
          .json({ error: "Error al registrar venta general" });
      }

      const ventaId = results.insertId; // Obtiene el ID de la venta general recién insertada

      // Condicional para insertar en creditos_ventas si forma_pago_id es 2 (crédito)
      if (forma_pago_id === 2) {
        const queryCreditosVentas = `
        INSERT INTO creditos_ventas (venta_general_id, fecha, cliente_id, abono_inicial, abono, total_a_pagar)
        VALUES (?, ?, ?, ?, ?, ?);
      `;

        const valuesCreditosVentas = [
          ventaId,
          fecha,
          cliente_id,
          abono_inicial || 0,
          0,
          total_a_pagar,
        ];

        connection.query(queryCreditosVentas, valuesCreditosVentas, (error) => {
          if (error) {
            console.error("Error al insertar en creditos_ventas:", error);
            return res
              .status(500)
              .json({ error: "Error al registrar crédito" });
          }
        });
      }

      // Inserta los detalles en venta_detalle
      const queryVentaDetalle = `
      INSERT INTO venta_detalle (producto_codigo, proveedor_id, subcategoria_id, formulacion_id, unidad_id, cantidad, precio_unitario, venta_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;

      const detallePromises = productos.map((producto) => {
        return new Promise((resolve, reject) => {
          // Inserción de cada detalle
          connection.query(
            queryVentaDetalle,
            [
              producto.codigo,
              producto.proveedor_id,
              producto.subcategoria_id,
              producto.formulacion_id,
              producto.unidad_id,
              producto.cantidad,
              producto.precio_venta,
              ventaId,
            ],
            (error) => {
              if (error) {
                console.error("Error en la inserción de venta_detalle:", error);
                return reject(error);
              }

              // Actualización de inventario después de insertar el detalle
              const queryUpdateInventario = `
              UPDATE producto 
              SET cantidad = cantidad - ? 
              WHERE codigo = ?;
            `;

              connection.query(
                queryUpdateInventario,
                [producto.cantidad, producto.codigo],
                (error) => {
                  if (error) {
                    console.error(
                      "Error al actualizar el inventario de producto:",
                      error
                    );
                    return reject(error);
                  }
                  resolve();
                }
              );
            }
          );
        });
      });

      // Ejecuta todas las inserciones en venta_detalle y actualizaciones de inventario
      Promise.all(detallePromises)
        .then(() => {
          res.status(201).json({
            message:
              "Venta completa insertada exitosamente y el inventario actualizado",
          });
        })
        .catch((error) => {
          console.error(
            "Error en la inserción de detalles de venta o actualización de inventario:",
            error
          );
          res.status(500).json({
            error:
              "Error al insertar detalles de venta o actualizar inventario",
          });
        });
    }
  );
});

// Ruta para obtener el último ID de venta_general
app.get("/ventas/ultimo-id", (req, res) => {
  const query = "SELECT MAX(id) AS ultimoId FROM venta_general";

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error al obtener el último ID de venta_general:", error);
      return res.status(500).json({ error: "Error al obtener el último ID" });
    }
    const ultimoId = results[0].ultimoId || 0; // Si no hay ventas, último ID será 0
    res.json({ siguienteId: ultimoId + 1 });
  });
});

/* Ruta para obtener las ventas generales */
app.get("/ventas/venta-general-vista", (req, res) => {
  const query = "SELECT * FROM venta_general ORDER BY fecha ASC";
  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Ruta para obtener los detalles de ventas con información del cliente */
app.get("/ventas/venta-detalle-vista", (req, res) => {
  const query = `
   SELECT 
    vd.id,
    vd.venta_id,
    vg.fecha,
    c.nombre AS cliente,
    c.cedula AS cliente_cedula,  -- Incluimos la cédula del cliente
    vd.producto_codigo,
    prod.nombre AS producto_nombre,
    f.nombre AS formulacion_nombre,
    u.nombre AS unidad_nombre,
    vd.cantidad,
    vd.precio_unitario,
    vd.subtotal
FROM 
    venta_detalle vd
JOIN 
    venta_general vg ON vd.venta_id = vg.id
JOIN 
    cliente c ON vg.cliente_id = c.id
JOIN 
    producto prod ON vd.producto_codigo = prod.codigo
JOIN 
    formulacion f ON vd.formulacion_id = f.id
JOIN 
    unidad u ON vd.unidad_id = u.id
ORDER BY 
    vg.fecha DESC, vd.id DESC;


  `;
  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

// Contactos

/* Obtener clientes */
app.get("/contactos/cliente", (req, res) => {
  const query =
    "SELECT id, nombre, cedula, celular, correo, direccion FROM cliente";
  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Agregar un cliente */
app.post("/contactos/cliente-agregar", (req, res) => {
  const nuevoCliente = req.body;

  const query = `
    INSERT INTO cliente (nombre, cedula, celular, correo, direccion) 
    VALUES (?, ?, ?, ?, ?)`;

  const values = [
    nuevoCliente.nombre,
    nuevoCliente.cedula,
    nuevoCliente.celular,
    nuevoCliente.correo,
    nuevoCliente.direccion,
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevoCliente });
  });
});

/* Modificar un cliente */
app.put("/contactos/cliente-modificar/:cedula", (req, res) => {
  const { cedula } = req.params;
  const updatedData = req.body;

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }
  if (updatedData.celular) {
    setClause.push("celular = ?");
    values.push(updatedData.celular);
  }
  if (updatedData.correo) {
    setClause.push("correo = ?");
    values.push(updatedData.correo);
  }
  if (updatedData.direccion) {
    setClause.push("direccion = ?");
    values.push(updatedData.direccion);
  }
  if (updatedData.nuevaCedula) {
    setClause.push("cedula = ?");
    values.push(updatedData.nuevaCedula);
  }

  values.push(cedula);

  const query = `UPDATE cliente SET ${setClause.join(", ")} WHERE cedula = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }
    res.json({ message: "Cliente modificado correctamente" });
  });
});

/* Eliminar un cliente por cédula */
app.delete("/contactos/cliente-eliminar/:cedula", (req, res) => {
  const cedula = req.params.cedula;

  const query = "DELETE FROM cliente WHERE cedula = ?";

  connection.query(query, [cedula], (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Cliente no encontrado" });
    }
    res.status(200).json({ message: "Cliente eliminado correctamente" });
  });
});

/* Obtener proveedor */
app.get("/contactos/proveedores", (req, res) => {
  const query = `
    SELECT p.id, p.nit, p.nombre, p.celular, p.direccion, m.nombre AS municipio_nombre
    FROM proveedor p
    JOIN municipio m ON p.municipio_codigo = m.codigo`;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Agregar un proveedor */
app.post("/contactos/proveedores-agregar", (req, res) => {
  const nuevoProveedor = req.body; // Obtiene el cuerpo de la solicitud

  const query = `
    INSERT INTO proveedor (nit, nombre, celular, direccion, municipio_codigo) 
    VALUES (?, ?, ?, ?, ?)`;

  const values = [
    nuevoProveedor.nit,
    nuevoProveedor.nombre,
    nuevoProveedor.celular,
    nuevoProveedor.direccion,
    nuevoProveedor.municipio_codigo, // Asegúrate de que este campo coincida con tu base de datos
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevoProveedor });
  });
});

/* Modificar un proveedor */
app.put("/contactos/proveedores-modificar/:id", (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.nit) {
    setClause.push("nit = ?");
    values.push(updatedData.nit);
  }
  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }
  if (updatedData.celular) {
    setClause.push("celular = ?");
    values.push(updatedData.celular);
  }
  if (updatedData.direccion) {
    setClause.push("direccion = ?");
    values.push(updatedData.direccion);
  }
  if (updatedData.municipio_codigo) {
    setClause.push("municipio_codigo = ?");
    values.push(updatedData.municipio_codigo);
  }

  values.push(id);

  const query = `UPDATE proveedor SET ${setClause.join(", ")} WHERE id = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }
    res.json({ message: "Proveedor modificado correctamente" });
  });
});

/* Eliminar un proveedor por ID */
app.delete("/contactos/proveedores-eliminar/:id", (req, res) => {
  const id = req.params.id; // Usa el ID del proveedor

  const query = "DELETE FROM proveedor WHERE id = ?"; // Asegúrate de que `id` sea el nombre correcto de tu columna

  connection.query(query, [id], (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }
    res.status(200).json({ message: "Proveedor eliminado correctamente" });
  });
});

/* Obtener transportadores */
app.get("/contactos/transportador", (req, res) => {
  const query = `
    SELECT t.id, t.nombre, t.celular, m.nombre AS municipio_nombre
    FROM transportador t
    JOIN municipio m ON t.municipio_id = m.codigo`;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Agregar un transportador */
app.post("/contactos/transportador-agregar", (req, res) => {
  const nuevoTransportador = req.body;

  const query = `
    INSERT INTO transportador (nombre, celular, municipio_id) 
    VALUES (?, ?, ?)`;

  const values = [
    nuevoTransportador.nombre,
    nuevoTransportador.celular,
    nuevoTransportador.municipio_id,
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevoTransportador });
  });
});

/* Modificar un transportador */
app.put("/contactos/transportador-modificar/:id", (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }
  if (updatedData.celular) {
    setClause.push("celular = ?");
    values.push(updatedData.celular);
  }
  if (updatedData.municipio_id) {
    setClause.push("municipio_id = ?");
    values.push(updatedData.municipio_id);
  }

  values.push(id);

  const query = `UPDATE transportador SET ${setClause.join(", ")} WHERE id = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Transportador no encontrado" });
    }
    res.json({ message: "Transportador modificado correctamente" });
  });
});

/* Eliminar un transportador por ID */
app.delete("/contactos/transportador-eliminar/:id", (req, res) => {
  const id = req.params.id;

  const query = "DELETE FROM transportador WHERE id = ?";

  connection.query(query, [id], (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Transportador no encontrado" });
    }
    res.status(200).json({ message: "Transportador eliminado correctamente" });
  });
});

/* Obtener vendedores */
app.get("/contactos/vendedor", (req, res) => {
  const query = "SELECT id, nombre, celular, correo, contrasena FROM vendedor";
  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Agregar un vendedor */
app.post("/contactos/vendedor-agregar", (req, res) => {
  const nuevoVendedor = req.body;

  const query = `
    INSERT INTO vendedor (nombre, celular, correo, contrasena) 
    VALUES (?, ?, ?, ?)`;

  const values = [
    nuevoVendedor.nombre,
    nuevoVendedor.celular,
    nuevoVendedor.correo,
    nuevoVendedor.contrasena,
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevoVendedor });
  });
});

/* Modificar un vendedor */
app.put("/contactos/vendedor-modificar/:id", (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  if (!Object.keys(updatedData).length) {
    return res.status(400).json({
      message:
        "Al menos un campo debe ser proporcionado para la actualización.",
    });
  }

  const setClause = [];
  const values = [];

  if (updatedData.nombre) {
    setClause.push("nombre = ?");
    values.push(updatedData.nombre);
  }
  if (updatedData.celular) {
    setClause.push("celular = ?");
    values.push(updatedData.celular);
  }
  if (updatedData.correo) {
    setClause.push("correo = ?");
    values.push(updatedData.correo);
  }
  if (updatedData.contrasena) {
    setClause.push("contrasena = ?");
    values.push(updatedData.contrasena);
  }

  values.push(id);

  const query = `UPDATE vendedor SET ${setClause.join(", ")} WHERE id = ?`;

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Vendedor no encontrado" });
    }
    res.json({ message: "Vendedor modificado correctamente" });
  });
});

/* Eliminar un vendedor */
app.delete("/contactos/vendedor-eliminar/:id", (req, res) => {
  const { id } = req.params;

  const query = `DELETE FROM vendedor WHERE id = ?`;

  connection.query(query, [id], (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Vendedor no encontrado" });
    }
    res.json({ message: "Vendedor eliminado correctamente" });
  });
});

// Creditos
/* Ruta para obtener los créditos de ventas con información del cliente y el estado de la venta */
app.get("/creditos/creditos-ventas-vista", (req, res) => {
  const query = `
    SELECT 
    cv.id,
    vg.id AS venta_general,  
    cv.fecha,
    c.id AS cliente_id,            -- Añade el ID del cliente
    c.cedula AS cedula,
    c.nombre AS cliente,               
    cv.abono_inicial,
    cv.abono,
    cv.total_abonado,
    cv.total_a_pagar,
    cv.saldo_pendiente,
    ev.nombre AS estado_pago   
FROM 
    creditos_ventas cv
JOIN 
    venta_general vg ON cv.venta_general_id = vg.id
JOIN 
    cliente c ON cv.cliente_id = c.id
JOIN 
    estado_pago ev ON cv.estado_pago_id = ev.id
ORDER BY 
    cv.fecha DESC, 
    cv.id DESC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

/* Agregar un crédito de venta */
app.post("/creditos/ventas-agregar", (req, res) => {
  const nuevoCredito = req.body;

  console.log("Datos recibidos para agregar crédito:", nuevoCredito); // Verifica los datos recibidos

  const query = `
    INSERT INTO creditos_ventas (venta_general_id, fecha, cliente_id, abono_inicial, abono, total_a_pagar) 
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const values = [
    nuevoCredito.venta_general_id,
    nuevoCredito.fecha,
    nuevoCredito.cliente_id,
    nuevoCredito.abono_inicial,
    nuevoCredito.abono,
    nuevoCredito.total_a_pagar,
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      console.error("Error al ejecutar la consulta:", error); // Muestra el error en la consola del servidor
      return res.status(500).json({ error: error.message }); // Envía el mensaje de error al frontend
    }
    res.status(201).json({ id: result.insertId, ...nuevoCredito });
  });
});

/* Generación secreto TOTP */

app.post("/api/generate-2FA-key", (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res
      .status(400)
      .json({ success: false, message: "Datos incompletos" });
  }

  /* Verificar si el usuario existe */
  const checkUserQuery = "SELECT id FROM usuarios WHERE id = ?";
  connection.query(checkUserQuery, [userId], (error, results) => {
    if (error) {
      console.error("Error al verificar el usuario: ", error);
      return res
        .status(500)
        .json({ success: false, message: "Error en el servidor" });
    }

    if (results.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });
    }

    /* Generar el secreto TOTP */
    const secret = speakeasy.generateSecret({ length: 20 });

    /* Guardar el secreto en la base de datos */
    const updateQuery = "UPDATE usuarios SET secret_2FA = ? WHERE id = ?";
    connection.query(updateQuery, [secret.base32, userId], (error) => {
      if (error) {
        console.error("Error al guardar la autenticación 2FA: ", error);
        return res
          .status(500)
          .json({ success: false, message: "Error en el servidor" });
      }

      /* Devolver el secreto y la URL para el código QR */
      res.json({
        success: true,
        secret: secret.base32,
        otpauthURL: secret.otpauthURL,
      });
    });
  });
});

/* Verificar code TOTP */

app.post("/api/verify-2FA", (req, res) => {
  const { userId, token } = req.body;

  if (!userId || !token) {
    return res
      .status(400)
      .json({ success: false, message: "Datos incompletos" });
  }

  /* Obtener el secreto del usuario */
  const query = "SELECT secret_2FA FROM usuarios WHERE id = ?";
  connection.query(query, [userId], (error, results) => {
    if (error) {
      console.error("Error al obtener el secreto 2FA: ", error);
      return res
        .status(500)
        .json({ success: false, message: "Error en el servidor" });
    }

    if (results.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Usuario no encontrado" });
    }

    const secret = results[0].secret_2FA;

    /* Verificar el código TOTP */
    const isValid = speakeasy.totp.verify({
      secret: secret,
      encoding: "base32",
      token: token,
      window: 1 /* Permite un margen de 1 token anterior/posterior */,
    });

    if (isValid) {
      res.json({ success: true, message: "Código válido" });
    } else {
      res.status(401).json({ success: false, message: "Código inválido" });
    }
  });
});

// Municipio

app.get("/api/municipios", (req, res) => {
  const searchTerm = req.query.search || "";

  const query = `
    SELECT * FROM municipio 
    WHERE nombre LIKE ?`;
  const values = [`%${searchTerm}%`];

  connection.query(query, values, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

// Formas de Pago - Obtener formas de pago
app.get("/api/formas-pago", (req, res) => {
  const searchTerm = req.query.search || ""; // Término de búsqueda opcional

  const query = `
    SELECT * FROM forma_pago 
    WHERE nombre LIKE ?`; // Filtro por nombre usando LIKE
  const values = [`%${searchTerm}%`]; // Inserta el término de búsqueda como parámetro

  // Ejecutar consulta
  connection.query(query, values, (error, results) => {
    if (error) {
      // Si ocurre un error en la base de datos, devolver un error 500
      return res
        .status(500)
        .json({ error: "Error al obtener las formas de pago" });
    }
    // Respuesta exitosa con los resultados
    res.json(results);
  });
});

// Obtener transportadores con filtro opcional
app.get("/api/transportadores", (req, res) => {
  const searchTerm = req.query.search || ""; // Término de búsqueda opcional

  const query = `
    SELECT * FROM transportador 
    WHERE nombre LIKE ?`; // Filtro por nombre usando LIKE
  const values = [`%${searchTerm}%`]; // Inserta el término de búsqueda como parámetro

  // Ejecutar consulta
  connection.query(query, values, (error, results) => {
    if (error) {
      // Manejo de errores de la base de datos
      return res
        .status(500)
        .json({ error: "Error al obtener los transportadores" });
    }
    // Respuesta con los resultados
    res.json(results);
  });
});

// Ruta para obtener el último ID de compra_general
app.get("/compras/ultimo-id", (req, res) => {
  const query = "SELECT MAX(id) AS ultimoId FROM compra_general";

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error al obtener el último ID de compra_general:", error);
      return res.status(500).json({ error: "Error al obtener el último ID" });
    }
    const ultimoId = results[0].ultimoId || 0; // Si no hay registros, último ID será 0
    res.json({ siguienteId: ultimoId + 1 });
  });
});

// Ruta para obtener el último ID de la tabla envios
app.get("/envios/ultimo-id", (req, res) => {
  const query = "SELECT MAX(id) AS ultimoId FROM envios";

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error al obtener el último ID de la tabla envios:", error);
      return res.status(500).json({ error: "Error al obtener el último ID" });
    }
    const ultimoId = results[0].ultimoId || 0; // Si no hay registros, último ID será 0
    res.json({ siguienteId: ultimoId + 1 }); // Incrementar en 1 para el siguiente ID
  });
});

/* Ruta para obtener el nombre del transportador por su ID */
app.get("/api/transportador/:id", (req, res) => {
  const transportadorId = req.params.id; // Obtener el ID de los parámetros de la URL
  const query = "SELECT nombre FROM transportador WHERE id = ?";

  connection.query(query, [transportadorId], (err, results) => {
    if (err) {
      console.error("Error al obtener el transportador: ", err);
      return res.status(500).send("Error al obtener el transportador");
    }

    // Validar si se encontró el transportador
    if (results.length === 0) {
      return res.status(404).send("Transportador no encontrado");
    }

    res.json(results[0]); // Enviar solo el primer resultado (nombre del transportador)
  });
});

// Inicio del servidor

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto http://localhost:${PORT}`);
});
