const express = require("express");
const connection = require("./db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const sharp = require('sharp');

const cors = require("cors");
const { ChartJSNodeCanvas } = require("chartjs-node-canvas");
const moment = require("moment");
const ChartDataLabels = require("chartjs-plugin-datalabels");
const { Chart } = require("chart.js");

const app = express();
app.use(cors());
app.use(express.json());
const SECRET_KEY =
  "078e61ddf7838590981558fbe12e7ca5a101095f7d7d84975fb26d4892e0ee83a7a8de0b7e0b62bf14ca9787f516c7810dfbe8930f781275e78d38e0457ac5a5";

/* Middleware para proteger las rutas */
const authMiddleware = (req, res, next) => {
  const token = req.headers["authorization"];
  if (!token) return res.sendStatus(403);

  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.sendStatus(403);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  });
};

/* function authorize(roles = []) {
  if (typeof roles === "string") {
    roles = [roles];
  }

  return (req, res, next) => {
    const token = req.headers["authorization"];
    if (token) {
      jwt.verify(token, "SECRET_KEY", (err, decoded) => {
        if (err) {
          return res.status(403).send("Token inválido");
        }
        if (roles.length && !roles.includes(decoded.role)) {
          return res.status(403).send("Access denied");
        }
        req.user = decoded;
        next();
      });
    } else {
      res.status(401).send("Token sin proveer");
    }
  };
} */

Chart.register(ChartDataLabels);

const chartJSNodeCanvas = new ChartJSNodeCanvas({
  width: 1200,
  height: 600,
  backgroundColour: "white",
});

// Inicio - analisis

// Ruta para obtener el gráfico doble de ventas por forma de pago
app.get("/grafico-doble", async (req, res) => {
  const query = `
    SELECT fecha, total, forma_pago_id
    FROM venta_general
    WHERE MONTH(fecha) = MONTH(CURRENT_DATE)
    AND YEAR(fecha) = YEAR(CURRENT_DATE)
    ORDER BY fecha ASC;
  `;

  connection.query(query, async (error, results) => {
    if (error) {
      console.error("Error al obtener los datos de ventas:", error);
      return res
        .status(500)
        .json({ error: "Error al obtener los datos de ventas" });
    }

    const labels = [
      ...new Set(results.map((row) => moment(row.fecha).format("YYYY-MM-DD"))),
    ];
    const pagos = {};

    results.forEach((row) => {
      const fecha = moment(row.fecha).format("YYYY-MM-DD");
      const formaPago =
        row.forma_pago_id === 1 ? "Ventas de Contado" : "Ventas a Crédito";
      if (!pagos[formaPago]) {
        pagos[formaPago] = {};
      }
      pagos[formaPago][fecha] = (pagos[formaPago][fecha] || 0) + row.total;
    });

    const datasets = Object.keys(pagos).map((formaPago) => ({
      label: formaPago,
      data: labels.map((fecha) => pagos[formaPago][fecha] || 0),
      borderColor: formaPago === "Ventas de Contado" ? "blue" : "red",
      fill: false,
      tension: 0.1,
      borderWidth: 2,
      pointBackgroundColor: formaPago === "Ventas de Contado" ? "blue" : "red",
    }));

    const configuration = {
      type: "line",
      data: {
        labels: labels,
        datasets: datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              usePointStyle: true,
              pointStyle: "circle",
            },
          },
          datalabels: {
            color: "#000",
            font: {
              size: 14,
              weight: "bold",
            },
            formatter: (value, context) => {
              if (value === 0) return "";
              const index = context.dataIndex;
              const totalPoints = context.dataset.data.length;
              if (index === 0) return `$ ${value.toLocaleString("es-ES")}`;
              if (index === totalPoints - 1)
                return `$ ${value.toLocaleString("es-ES")}`;
              return `$ ${value.toLocaleString("es-ES")}`;
            },
            anchor: (context) => {
              const index = context.dataIndex;
              const totalPoints = context.dataset.data.length;
              if (index === 0) return "start";
              if (index === totalPoints - 1) return "end";
              return "end";
            },
            align: (context) => {
              const index = context.dataIndex;
              const totalPoints = context.dataset.data.length;
              if (index === 0) return "right";
              if (index === totalPoints - 1) return "left";
              return "top";
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 50000,
              font: {
                size: 12,
              },
              callback: function (value) {
                return `$ ${value.toLocaleString("es-ES")}`;
              },
            },
          },
        },
      },
    };

    const image = await sharp({
      create: {
        width: 1200,
        height: 600,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        {
          input: await chartJSNodeCanvas.renderToBuffer(configuration),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    res.set("Content-Type", "image/png");
    res.send(image);
  });
});

// Gráfico de Barras de las subcategorias
app.get("/grafico-barras", async (req, res) => {
  const query = `
    SELECT s.nombre AS subcategoria, SUM(vd.subtotal) AS total
    FROM venta_detalle vd
    JOIN subcategoria s ON vd.subcategoria_id = s.id
    JOIN venta_general vg ON vd.venta_id = vg.id
    WHERE MONTH(vg.fecha) = MONTH(CURDATE()) AND YEAR(vg.fecha) = YEAR(CURDATE())
    GROUP BY vd.subcategoria_id;
  `;

  connection.query(query, async (error, results) => {
    if (error) {
      console.error("Error al obtener los datos de ventas:", error);
      return res
        .status(500)
        .json({ error: "Error al obtener los datos de ventas" });
    }

    const labels = results.map((row) => row.subcategoria);
    const data = results.map((row) => row.total);

    const colors = [
      "#FF6384",
      "#36A2EB",
      "#FFCE56",
      "#4BC0C0",
      "#9966FF",
      "#E7E9ED",
    ];

    const configuration = {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Ventas por Subcategoría",
            data: data,
            backgroundColor: colors,
            borderColor: "#fff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: false,
        scales: {
          y: {
            ticks: {
              font: {
                size: 12,
              },
              callback: function (value) {
                return `$ ${value.toLocaleString("es-ES")}`;
              },
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: function (tooltipItem) {
                return `Total: $ ${tooltipItem.raw.toLocaleString("es-ES")}`;
              },
            },
          },
          datalabels: {
            display: true,
            anchor: "end",
            align: "top",
            color: "#000",
            font: {
              size: 24,
              weight: "bold",
            },
            formatter: function (value) {
              return `$ ${value.toLocaleString("es-ES")}`;
            },
          },
        },
      },
    };

    const image = await sharp({
      create: {
        width: 1200,
        height: 600,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        {
          input: await chartJSNodeCanvas.renderToBuffer(configuration),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    res.set("Content-Type", "image/png");
    res.send(image);
  });
});

// Gráfico de Barras de las Categorías
app.get("/grafico-barras-categorias", async (req, res) => {
  const query = `
    SELECT c.nombre AS categoria, SUM(vd.subtotal) AS total
    FROM venta_detalle vd
    JOIN subcategoria s ON vd.subcategoria_id = s.id
    JOIN categoria c ON s.categoria_id = c.id
    JOIN venta_general vg ON vd.venta_id = vg.id
    WHERE MONTH(vg.fecha) = MONTH(CURDATE()) AND YEAR(vg.fecha) = YEAR(CURDATE())
    GROUP BY c.id, c.nombre;
  `;

  connection.query(query, async (error, results) => {
    if (error) {
      console.error("Error al obtener los datos de ventas:", error);
      return res
        .status(500)
        .json({ error: "Error al obtener los datos de ventas" });
    }

    const labels = results.map((row) => row.categoria);
    const data = results.map((row) => row.total);

    const colors = [
      "#FF6384",
      "#36A2EB",
      "#FFCE56",
      "#4BC0C0",
      "#9966FF",
      "#E7E9ED",
    ];

    const configuration = {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Ventas por Categoría",
            data: data,
            backgroundColor: colors,
            borderColor: "#fff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: false,
        scales: {
          x: {
            ticks: {
              font: {
                size: 24,
              },
            },
          },
          y: {
            ticks: {
              font: {
                size: 24,
              },
              callback: function (value) {
                return `$ ${value.toLocaleString("es-ES")}`;
              },
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: function (tooltipItem) {
                return `Total: $ ${tooltipItem.raw.toLocaleString("es-ES")}`;
              },
            },
          },
          datalabels: {
            display: true,
            anchor: "end",
            align: "top",
            color: "#000",
            font: {
              size: 24,
              weight: "bold",
            },
            formatter: function (value) {
              return `$ ${value.toLocaleString("es-ES")}`;
            },
          },
        },
      },
    };

    const image = await sharp({
      create: {
        width: 1200,
        height: 600,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        {
          input: await chartJSNodeCanvas.renderToBuffer(configuration),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    res.set("Content-Type", "image/png");
    res.send(image);
  });
});

// Gráfico de Barras de Compras por Proveedor
app.get("/grafico-barras-proveedores", async (req, res) => {
  const query = `
    SELECT p.nombre AS proveedor, SUM(cg.total) AS total_compras
    FROM compra_general cg
    JOIN proveedor p ON cg.proveedor_id = p.id
    WHERE MONTH(cg.fecha) = MONTH(CURDATE()) AND YEAR(cg.fecha) = YEAR(CURDATE())
    GROUP BY p.id, p.nombre;
  `;

  connection.query(query, async (error, results) => {
    if (error) {
      console.error("Error al obtener los datos de compras:", error);
      return res
        .status(500)
        .json({ error: "Error al obtener los datos de compras" });
    }

    const labels = results.map((row) => row.proveedor);
    const data = results.map((row) => row.total_compras);

    const colors = [
      "#FF6384",
      "#36A2EB",
      "#FFCE56",
      "#4BC0C0",
      "#9966FF",
      "#E7E9ED",
    ];

    const configuration = {
      type: "bar",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Compras por Proveedor",
            data: data,
            backgroundColor: colors,
            borderColor: "#fff",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: false,
        layout: {
          padding: {
            top: 60,
          },
        },
        scales: {
          x: {
            ticks: {
              font: {
                size: 24,
              },
            },
          },
          y: {
            ticks: {
              font: {
                size: 24,
              },
              callback: function (value) {
                return `$ ${value.toLocaleString("es-ES")}`;
              },
            },
          },
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: function (tooltipItem) {
                return `$ ${tooltipItem.raw.toLocaleString("es-ES")}`;
              },
            },
          },
          datalabels: {
            display: true,
            anchor: "end",
            align: "top",
            color: "#000",
            font: {
              size: 24,
              weight: "bold",
            },
            formatter: function (value) {
              return `$ ${new Intl.NumberFormat("es-ES").format(value)}`;
            },
          },
        },
      },
      plugins: [ChartDataLabels],
    };

    const image = await sharp({
      create: {
        width: 1200,
        height: 600,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
      .composite([
        {
          input: await chartJSNodeCanvas.renderToBuffer(configuration),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    res.set("Content-Type", "image/png");
    res.send(image);
  });
});

// Inicio - balance diario

// Ruta para obtener los datos de balance con detalle en texto
app.get("/balance-diario", (req, res) => {
  const query = `
    SELECT 
      b.id,
      b.fecha,
      b.detalle_id AS detalle_numero, 
      bd.nombre AS detalle_texto, 
      b.ingresos,
      b.gastos
    FROM balance b
    LEFT JOIN balance_detalle bd ON b.detalle_id = bd.id
    ORDER BY b.fecha DESC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error al obtener los datos del balance:", error);
      return res
        .status(500)
        .json({ error: "Error al obtener los datos del balance" });
    }

    res.status(200).json(results);
  });
});

// agregar un gasto manualmente
app.post("/balance-agregar", (req, res) => {
  const { fecha, detalle_id, gastos } = req.body;

  if (![5, 6, 7, 8].includes(detalle_id)) {
    return res
      .status(400)
      .json({ error: "Solo se pueden insertar detalles con ID 5, 6, 7 u 8." });
  }

  const query = `
    INSERT INTO balance (fecha, detalle_id, gastos) 
    VALUES (?, ?, ?)
  `;

  connection.query(query, [fecha, detalle_id, gastos], (error, result) => {
    if (error) {
      console.error("Error al insertar en balance:", error);
      return res.status(500).json({ error: "Error al insertar en balance" });
    }
    res.status(201).json({ id: result.insertId, fecha, detalle_id, gastos });
  });
});

// balance total
app.get("/balance-total", (req, res) => {
  const query = `
    SELECT id, 
           MONTHNAME(fecha) AS mes, 
           ingresos, 
           gastos, 
           balance 
    FROM balance_total;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error al obtener balance total:", error);
      return res.status(500).json({ error: "Error al obtener balance total" });
    }

    const mesesEnEspanol = {
      January: "Enero",
      February: "Febrero",
      March: "Marzo",
      April: "Abril",
      May: "Mayo",
      June: "Junio",
      July: "Julio",
      August: "Agosto",
      September: "Septiembre",
      October: "Octubre",
      November: "Noviembre",
      December: "Diciembre",
    };

    const resultadosTraducidos = results.map((item) => ({
      ...item,
      mes: mesesEnEspanol[item.mes] || item.mes,
    }));

    res.status(200).json(resultadosTraducidos);
  });
});

// Ruta para obtener los tipos de detalle
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

// Stock
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

// Stock mínimo
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

// stock minimo, ruta para el boton de enviar pedido
app.post("/inventario/enviar-pedido", (req, res) => {
  const { codigos, estado_id } = req.body;

  if (
    !Array.isArray(codigos) ||
    codigos.length === 0 ||
    typeof estado_id !== "number"
  ) {
    return res.status(400).json({
      error: "Debe proporcionar un array de códigos y un estado_id válido.",
    });
  }

  const query = `
    UPDATE producto
    SET estado_id = ?
    WHERE codigo IN (${codigos.map(() => "?").join(",")})
  `;

  const values = [estado_id, ...codigos];

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

// Lista de precios
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

// Obtener todos los productos con los nombres correspondientes
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

// Agregar un producto
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

// Modificar un producto
app.put("/producto-modificar/:codigo", (req, res) => {
  const { codigo } = req.params;
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

  values.push(codigo);

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

// Eliminar un producto
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

// Obtener prodcutos para vista de busqueda
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

// Ruta para elaborar un producto
app.put("/inventario/elaborar-agregar", (req, res) => {
  const { nombre, cantidadDestino, elaboracionDestino } = req.body;

  const queryIncrementar = `
    UPDATE producto 
    SET cantidad = cantidad + ? 
    WHERE nombre = ? 
      AND elaborado_id = (SELECT id FROM elaborado WHERE nombre = ?)
  `;

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

// Obtener productos no elaborados para vista de búsqueda en ventas
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

// Ruta para obtener subcategorías por categoria_id
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

// Obtener las categorías
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

// Agregar una categoría
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

// Modificar una categoría
app.put("/producto/categoria-modificar/:id", (req, res) => {
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

// Eliminar una categoría por ID
app.delete("/producto/categoria-eliminar/:id", (req, res) => {
  const id = req.params.id;

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

// Obtener las subcategorías
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

// Agregar una subcategoría
app.post("/producto/subcategoria-agregar", (req, res) => {
  const nuevaSubcategoria = req.body;

  const query = `
    INSERT INTO subcategoria (nombre, categoria_id) 
    VALUES (?, ?)`;

  const values = [nuevaSubcategoria.nombre, nuevaSubcategoria.categoria_id];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevaSubcategoria });
  });
});

// Modificar una subcategoría
app.put("/producto/subcategoria-modificar/:id", (req, res) => {
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

// Eliminar una subcategoría por ID
app.delete("/producto/subcategoria-eliminar/:id", (req, res) => {
  const id = req.params.id;

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

// Obtener las formulaciones
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

// Agregar una formulación
app.post("/producto/formulacion-agregar", (req, res) => {
  const nuevaFormulacion = req.body;

  const query = `
    INSERT INTO formulacion (nombre) 
    VALUES (?)`;

  const values = [nuevaFormulacion.nombre];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevaFormulacion });
  });
});

// Modificar una formulación
app.put("/producto/formulacion-modificar/:id", (req, res) => {
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

// Eliminar una formulación por ID
app.delete("/producto/formulacion-eliminar/:id", (req, res) => {
  const id = req.params.id;

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

// Obtener las unidades
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

// Agregar una unidad
app.post("/producto/unidad-agregar", (req, res) => {
  const nuevaUnidad = req.body;

  const query = `
    INSERT INTO unidad (nombre) 
    VALUES (?)`;

  const values = [nuevaUnidad.nombre];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevaUnidad });
  });
});

// Modificar una unidad
app.put("/producto/unidad-modificar/:id", (req, res) => {
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

// Eliminar una unidad por ID
app.delete("/producto/unidad-eliminar/:id", (req, res) => {
  const id = req.params.id;

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

// Obtener los estados
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

// Agregar un estado
app.post("/producto/estado-agregar", (req, res) => {
  const nuevoEstado = req.body;

  const query = `
    INSERT INTO estado (nombre) 
    VALUES (?)`;

  const values = [nuevoEstado.nombre];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevoEstado });
  });
});

// Modificar un estado
app.put("/producto/estado-modificar/:id", (req, res) => {
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

// Eliminar un estado por ID
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

// Obtener los elaborados
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

// Agregar un elaborado
app.post("/producto/elaborado-agregar", (req, res) => {
  const nuevoElaborado = req.body;

  const query = `
    INSERT INTO elaborado (nombre) 
    VALUES (?)`;

  const values = [nuevoElaborado.nombre];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevoElaborado });
  });
});

// Modificar un elaborado
app.put("/producto/elaborado-modificar/:id", (req, res) => {
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

// Eliminar un elaborado por ID
app.delete("/producto/elaborado-eliminar/:id", (req, res) => {
  const id = req.params.id;

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

// ruta para buscar un producto en la base de datos para agregarlo
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

// Cambiar estado a 1
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

// ruta para selecionar el metodo de pago
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

// Método para cambiar el estado de un producto que no está en stock a estado de pedido
app.post("/pedido/id-producto-manual", (req, res) => {
  const productos = req.body.productos;

  if (!Array.isArray(productos) || productos.length === 0) {
    return res
      .status(400)
      .json({ message: "No se proporcionaron productos válidos." });
  }

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

// Agregar un envío
app.post("/pedido/envios-agregar", (req, res) => {
  const nuevoEnvio = req.body;

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

  const query = `
    INSERT INTO envios (transportador_id, kilos, precio_kilo, total_cajas) 
    VALUES (?, ?, ?, ?)
  `;

  const values = [
    nuevoEnvio.transportador_id,
    nuevoEnvio.kilos,
    nuevoEnvio.precio_kilo,
    nuevoEnvio.total_cajas,
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      console.error("Error al agregar el envío:", error);
      return res.status(500).json({ error: "Error al agregar el envío." });
    }

    res.status(201).json({ id: result.insertId, ...nuevoEnvio });
  });
});

// Compras

// Visualizar compras completas
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
    console.log(`Usando envio_id existente: ${envio_id}`);
    procesarProveedores(envio_id, proveedores, res);
  } else {
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

      const nuevoEnvioId = envioResult.insertId;
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

          const compraId = compraResult.insertId;
          console.log(`Compra registrada con ID: ${compraId}`);

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
              0,
              proveedor.total_a_pagar || 0,
            ];

            connection.query(queryCreditosCompras, creditosValues, (error) => {
              if (error) {
                console.error("Error al insertar en creditos_compras:", error);
                return reject(error);
              }
            });
          }

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

          Promise.all(detallePromises).then(resolve).catch(reject);
        }
      );
    });
  });

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

// Ruta para obtener las compras generales
app.get("/compras/compra-general-vista", (req, res) => {
  const query = "SELECT * FROM compra_general ORDER BY fecha ASC";
  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

// Ruta para obtener los detalles de compras con información del proveedor
app.get("/compras/compra-detalle-vista", (req, res) => {
  const query = `
    SELECT 
      cd.id,
      cd.compra_id,
      cg.fecha,
      p.nombre AS proveedor,
      p.nit AS proveedor_nit,
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

// Eliminar un detalle específico de una venta
app.delete("/api/eliminar-detalle-venta/:id", (req, res) => {
  const detalleId = req.params.id;

  const query = `DELETE FROM venta_detalle WHERE id = ?`;

  connection.query(query, [detalleId], (error, results) => {
    if (error) {
      console.error("Error eliminando el detalle de venta:", error);
      return res
        .status(500)
        .json({ error: "Error eliminando el detalle de venta" });
    }

    if (results.affectedRows > 0) {
      res
        .status(200)
        .json({ message: "Detalle de venta eliminado correctamente" });
    } else {
      res.status(404).json({ error: "Detalle de venta no encontrado" });
    }
  });
});

// Eliminar una venta general
app.delete("/api/eliminar-venta/:id", (req, res) => {
  const ventaId = req.params.id;

  const queryDetalle = `DELETE FROM venta_detalle WHERE venta_id = ?`;
  const queryVenta = `DELETE FROM venta_general WHERE id = ?`;

  connection.query(queryDetalle, [ventaId], (error, results) => {
    if (error) {
      console.error("Error eliminando detalles de venta:", error);
      return res
        .status(500)
        .json({ error: "Error eliminando detalles de venta" });
    }

    connection.query(queryVenta, [ventaId], (error, results) => {
      if (error) {
        console.error("Error eliminando la venta:", error);
        return res.status(500).json({ error: "Error eliminando la venta" });
      }

      res
        .status(200)
        .json({ message: "Venta y detalles eliminados correctamente" });
    });
  });
});

// Devolucion de venta
app.post("/api/devolucion-venta", (req, res) => {
  const { devoluciones } = req.body;

  if (
    !devoluciones ||
    !Array.isArray(devoluciones) ||
    devoluciones.length === 0
  ) {
    return res
      .status(400)
      .json({ error: "Se requiere una lista de devoluciones válida." });
  }

  const query = `CALL registrar_devolucion(?, ?, ?);`;

  let errores = [];
  let procesadas = 0;

  devoluciones.forEach((dev, index) => {
    const { venta_id, producto_codigo, cantidad_devuelta } = dev;

    if (!venta_id || !producto_codigo || !cantidad_devuelta) {
      errores.push(`Error en devolución ${index + 1}: Datos incompletos.`);
      return;
    }

    connection.query(
      query,
      [venta_id, producto_codigo, cantidad_devuelta],
      (error, results) => {
        if (error) {
          console.error(`Error en la devolución ${index + 1}:`, error);
          errores.push(`Error en devolución ${index + 1}: ${error.message}`);
        }
        procesadas++;

        if (procesadas === devoluciones.length) {
          if (errores.length > 0) {
            return res
              .status(500)
              .json({ message: "Algunas devoluciones fallaron.", errores });
          }
          res
            .status(201)
            .json({ message: "Devoluciones registradas exitosamente." });
        }
      }
    );
  });
});

// Obtener factura actual
app.get("/api/factura-actual", (req, res) => {
  const queryUltimaFactura = `
    SELECT factura FROM venta_general
    ORDER BY id DESC
    LIMIT 1;
  `;

  connection.query(queryUltimaFactura, (error, results) => {
    if (error) {
      return res
        .status(500)
        .json({ error: "Error al obtener la última factura registrada" });
    }

    let ultimaFactura = results.length > 0 ? results[0].factura : null;

    console.log("Última factura registrada en venta_general:", ultimaFactura);

    let querySiguienteFactura;

    if (ultimaFactura === null) {
      querySiguienteFactura = `
        SELECT numero_factura_actual 
        FROM configuracion_factura
        ORDER BY id ASC
        LIMIT 1;
      `;
    } else {
      querySiguienteFactura = `
        SELECT numero_factura_actual 
        FROM configuracion_factura
        WHERE CAST(numero_factura_actual AS UNSIGNED) > CAST(? AS UNSIGNED)
        ORDER BY id ASC
        LIMIT 1;
      `;
    }

    connection.query(
      querySiguienteFactura,
      [ultimaFactura],
      (error, results) => {
        if (error) {
          return res.status(500).json({
            error: "Error al obtener la siguiente factura disponible",
          });
        }

        console.log("Resultado de configuracion_factura:", results);

        if (results.length > 0) {
          res.json({ factura_actual: results[0].numero_factura_actual });
        } else {
          res
            .status(404)
            .json({ error: "No hay facturas disponibles en la configuración" });
        }
      }
    );
  });
});

// Obtener ventas para vista de busqueda
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

      const ventaId = results.insertId;

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

      const queryVentaDetalle = `
      INSERT INTO venta_detalle (producto_codigo, proveedor_id, subcategoria_id, formulacion_id, unidad_id, cantidad, precio_unitario, venta_id) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;

      const detallePromises = productos.map((producto) => {
        return new Promise((resolve, reject) => {
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
    const ultimoId = results[0].ultimoId || 0;
    res.json({ siguienteId: ultimoId + 1 });
  });
});

// Ruta para obtener las ventas generales
app.get("/ventas/venta-general-vista", (req, res) => {
  const query = "SELECT * FROM venta_general ORDER BY fecha ASC";
  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

// Ruta para obtener los detalles de ventas con información del cliente
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

// Obtener clientes
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

// Agregar un cliente
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

// Modificar un cliente
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

// Eliminar un cliente por cédula
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

// Obtener proveedor
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

// Agregar un proveedor
app.post("/contactos/proveedores-agregar", (req, res) => {
  const nuevoProveedor = req.body;

  const query = `
    INSERT INTO proveedor (nit, nombre, celular, direccion, municipio_codigo) 
    VALUES (?, ?, ?, ?, ?)`;

  const values = [
    nuevoProveedor.nit,
    nuevoProveedor.nombre,
    nuevoProveedor.celular,
    nuevoProveedor.direccion,
    nuevoProveedor.municipio_codigo,
  ];

  connection.query(query, values, (error, result) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.status(201).json({ id: result.insertId, ...nuevoProveedor });
  });
});

// Modificar un proveedor
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

// Eliminar un proveedor por ID
app.delete("/contactos/proveedores-eliminar/:id", (req, res) => {
  const id = req.params.id;

  const query = "DELETE FROM proveedor WHERE id = ?";

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

// Obtener transportadores
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

// Agregar un transportador
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

// Modificar un transportador
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

// Eliminar un transportador por ID
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

// Obtener vendedores
app.get("/contactos/vendedor", (req, res) => {
  const query = "SELECT id, nombre, celular, correo, contrasena FROM vendedor";
  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

// Agregar un vendedor
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

// Modificar un vendedor
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

// Eliminar un vendedor
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

// Ruta para obtener los créditos de ventas con información del cliente y el estado de la venta
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

// Agregar un crédito de venta
app.post("/creditos/ventas-agregar", (req, res) => {
  const nuevoCredito = req.body;

  console.log("Datos recibidos para agregar crédito:", nuevoCredito);

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
      console.error("Error al ejecutar la consulta:", error);
      return res.status(500).json({ error: error.message });
    }
    res.status(201).json({ id: result.insertId, ...nuevoCredito });
  });
});

// Ruta para obtener los créditos de compras con información del proveedor y el estado de pago
app.get("/creditos/creditos-compras-vista", (req, res) => {
  const query = `
    SELECT 
    cc.id,
    cg.id AS compra_general_id,  
    cc.fecha,
    p.nit AS nit,  -- Se agregó el campo NIT del proveedor
    p.id AS proveedor_id,      
    p.nombre AS proveedor,               
    cc.abono_inicial,
    cc.abono,
    cc.total_abonado,
    cc.total_a_pagar,
    cc.saldo_pendiente,
    ep.nombre AS estado_pago   
FROM 
    creditos_compras cc
JOIN 
    compra_general cg ON cc.compra_general_id = cg.id
JOIN 
    proveedor p ON cc.proveedor_id = p.id
JOIN 
    estado_pago ep ON cc.estado_pago_id = ep.id
ORDER BY 
    cc.fecha DESC, 
    cc.id DESC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({ error });
    }
    res.json(results);
  });
});

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

// Extras

// Agregar facturas
app.post("/agregar-configuracion-factura", (req, res) => {
  const { fecha, numero_factura_inicial, numero_factura_final } = req.body;

  if (!fecha || !numero_factura_inicial || !numero_factura_final) {
    return res.status(400).json({ error: "Todos los campos son obligatorios" });
  }

  const query = `
    INSERT INTO configuracion_factura (fecha, numero_factura_inicial, numero_factura_final)
    VALUES (?, ?, ?);
  `;

  connection.query(
    query,
    [fecha, numero_factura_inicial, numero_factura_final],
    (error, results) => {
      if (error) {
        return res.status(500).json({
          error: "Error al insertar la configuración de factura",
          detalles: error,
        });
      }
      res.status(201).json({
        message: "Configuración de factura agregada correctamente",
        id: results.insertId,
      });
    }
  );
});

// visualizar tabla de configuracion factura
app.get("/api/configuracion-facturas", (req, res) => {
  const query = `
    SELECT id, fecha, numero_factura_inicial, numero_factura_actual, numero_factura_final
    FROM configuracion_factura
    ORDER BY id ASC;
  `;

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({
        error: "Error al obtener las configuraciones de factura",
        detalles: error,
      });
    }

    res.status(200).json(results);
  });
});

// limpia la tabla y realiza el cierre de inventario
app.post("/realizar/cierre-inventario", (req, res) => {
  const { fecha_inicio, fecha_cierre } = req.body;

  if (!fecha_inicio || !fecha_cierre) {
    return res
      .status(400)
      .json({ error: "Debes proporcionar las fechas de inicio y cierre" });
  }

  const verificarQuery =
    "SELECT COUNT(*) AS total FROM cierre_inventario_calculo";

  connection.query(verificarQuery, (error, results) => {
    if (error) {
      return res.status(500).json({
        error: "Error al verificar cierre_inventario_calculo",
        detalles: error,
      });
    }

    const hayDatos = results[0].total > 0;

    const cantidadInicialQuery = hayDatos
      ? `SELECT codigo, cantidad_final AS cantidad_inicial FROM cierre_inventario_calculo`
      : `SELECT codigo, cantidad AS cantidad_inicial FROM producto`;

    connection.query(cantidadInicialQuery, (error, cantidadesIniciales) => {
      if (error) {
        return res.status(500).json({
          error: "Error al obtener cantidad inicial",
          detalles: error,
        });
      }

      connection.query("TRUNCATE TABLE cierre_inventario", (error) => {
        if (error) {
          return res.status(500).json({
            error: "Error al limpiar la tabla cierre_inventario",
            detalles: error,
          });
        }

        const insertQuery = `
          INSERT INTO cierre_inventario (fecha_inicio, fecha_cierre, codigo, nombre, compras, ventas, cantidad_final, precio_unitario)
          SELECT 
              ? AS fecha_inicio,  
              ? AS fecha_cierre,  
              p.codigo,
              p.nombre,
              COALESCE((SELECT SUM(cd.cantidad) FROM compra_detalle cd JOIN compra_general cg ON cd.compra_id = cg.id 
                        WHERE cd.producto_codigo = p.codigo AND cg.fecha BETWEEN ? AND ?), 0) AS compras,
              COALESCE((SELECT SUM(vd.cantidad) FROM venta_detalle vd JOIN venta_general vg ON vd.venta_id = vg.id 
                        WHERE vd.producto_codigo = p.codigo AND vg.fecha BETWEEN ? AND ?), 0) AS ventas,
              (
                COALESCE((SELECT ci.cantidad_inicial FROM (${cantidadInicialQuery}) ci WHERE ci.codigo = p.codigo), 0)
                + COALESCE((SELECT SUM(cd.cantidad) FROM compra_detalle cd JOIN compra_general cg ON cd.compra_id = cg.id 
                            WHERE cd.producto_codigo = p.codigo AND cg.fecha BETWEEN ? AND ?), 0)
                - COALESCE((SELECT SUM(vd.cantidad) FROM venta_detalle vd JOIN venta_general vg ON vd.venta_id = vg.id 
                            WHERE vd.producto_codigo = p.codigo AND vg.fecha BETWEEN ? AND ?), 0)
              ) AS cantidad_final,
              p.precio_compra AS precio_unitario
          FROM producto p;
        `;

        const valores = [
          fecha_inicio,
          fecha_cierre,
          fecha_inicio,
          fecha_cierre,
          fecha_inicio,
          fecha_cierre,
          fecha_inicio,
          fecha_cierre,
          fecha_inicio,
          fecha_cierre,
        ];

        connection.query(insertQuery, valores, (error, results) => {
          if (error) {
            return res.status(500).json({
              error: "Error al insertar el cierre de inventario",
              detalles: error,
            });
          }

          const insertOrUpdateCalculoQuery = `
            INSERT INTO cierre_inventario_calculo (codigo, cantidad_final)
            SELECT codigo, cantidad_final FROM cierre_inventario
            ON DUPLICATE KEY UPDATE cantidad_final = VALUES(cantidad_final);
          `;

          connection.query(
            insertOrUpdateCalculoQuery,
            (error, resultsCalculo) => {
              if (error) {
                return res.status(500).json({
                  error:
                    "Error al insertar/actualizar en cierre_inventario_calculo",
                  detalles: error,
                });
              }

              res.status(200).json({
                message:
                  "Cierre de inventario realizado correctamente y datos actualizados en cierre_inventario_calculo",
                registros_insertados: results.affectedRows,
                registros_calculo: resultsCalculo.affectedRows,
              });
            }
          );
        });
      });
    });
  });
});

// Visualizar los cierres de inventario
app.get("/visualizar/cierre-inventario", (req, res) => {
  const query = "SELECT * FROM cierre_inventario ORDER BY fecha_cierre DESC";

  connection.query(query, (error, results) => {
    if (error) {
      return res.status(500).json({
        error: "Error al obtener los cierres de inventario",
        detalles: error,
      });
    }
    res.status(200).json(results);
  });
});

// login

// Ruta para el registro
app.post("/api/register", (req, res) => {
  const { nombre, usuario, contrasena, rol_id } = req.body;

  /* Verificar si el usuario ya existe */
  const checkQuery = "SELECT * FROM usuarios WHERE usuario = ?";
  connection.query(checkQuery, [usuario], (error, results) => {
    if (error) {
      console.error("Error en la consulta SQL:", error);
      return res
        .status(500)
        .json({ success: false, message: "Error en el servidor" });
    }

    if (results.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "El usuario ya está registrado" });
    }

    bcrypt.hash(contrasena, 8, (err, hash) => {
      if (err) {
        console.error("Error al encriptar la contraseña:", err);
        return res
          .status(500)
          .json({ success: false, message: "Error en el servidor" });
      }

      const query =
        "INSERT INTO usuarios (nombre, usuario, contrasena, rol_id) VALUES (?, ?, ?, ?)";
      connection.query(
        query,
        [nombre, usuario, hash, rol_id],
        (error, results) => {
          if (error) {
            console.error("Error en la consulta SQL:", error);
            return res
              .status(500)
              .json({ success: false, message: "Error en el servidor" });
          }
          res.json({
            success: true,
            message: "Usuario registrado correctamente",
          });
        }
      );
    });
  });
});

// Ruta para el inicio de sesión
app.post("/api/login", (req, res) => {
  const { usuario, contrasena } = req.body;

  console.log("Datos recibidos en login:", usuario, contrasena);

  const query = "SELECT * FROM usuarios WHERE usuario = ?";
  connection.query(query, [usuario], (error, results) => {
    if (error) {
      console.error("Error en la consulta SQL:", error);
      return res
        .status(500)
        .json({ success: false, message: "Error en el servidor" });
    }

    console.log("Resultados de la consulta:", results);

    if (results.length > 0) {
      const user = results[0];

      console.log("Contraseña en la base de datos:", user.contrasena);

      bcrypt.compare(contrasena, user.contrasena, (err, isMatch) => {
        if (err) {
          console.error("Error al comparar contraseñas:", err);
          return res
            .status(500)
            .json({ success: false, message: "Error en el servidor" });
        }

        console.log("¿Contraseña válida?", isMatch);

        if (isMatch) {
          const token = jwt.sign(
            { id: user.id, role: user.rol_id },
            SECRET_KEY,
            { expiresIn: "1h" }
          );
          res.json({ success: true, token, id: user.id, rol_id: user.rol_id });
        } else {
          res.status(401).json({
            success: false,
            message: "Usuario o contraseña incorrectos",
          });
        }
      });
    } else {
      res
        .status(401)
        .json({ success: false, message: "Usuario o contraseña incorrectos" });
    }
  });
});

// Ruta para obtener los roles
app.get("/api/roles", (req, res) => {
  const query = "SELECT id, nombre FROM rol";
  connection.query(query, (error, results) => {
    if (error) {
      console.error("Error en la consulta SQL:", error);
      return res
        .status(500)
        .json({ success: false, message: "Error en el servidor" });
    }
    res.json(results);
  });
});

// Ruta para obtener datos de los usuarios
app.get("/api/datos-usuarios/:id", authMiddleware, (req, res) => {
  const userId = req.params.id;
  const query = `
    SELECT
        u.id,
        r.nombre AS rol,
        u.nombre,
        u.usuario
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

// Varios

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
  const searchTerm = req.query.search || "";

  const query = `
    SELECT * FROM forma_pago 
    WHERE nombre LIKE ?`;
  const values = [`%${searchTerm}%`];

  connection.query(query, values, (error, results) => {
    if (error) {
      return res
        .status(500)
        .json({ error: "Error al obtener las formas de pago" });
    }
    res.json(results);
  });
});

// Obtener transportadores con filtro opcional
app.get("/api/transportadores", (req, res) => {
  const searchTerm = req.query.search || "";

  const query = `
    SELECT * FROM transportador 
    WHERE nombre LIKE ?`;
  const values = [`%${searchTerm}%`];

  connection.query(query, values, (error, results) => {
    if (error) {
      return res
        .status(500)
        .json({ error: "Error al obtener los transportadores" });
    }
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
    const ultimoId = results[0].ultimoId || 0;
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
    const ultimoId = results[0].ultimoId || 0;
    res.json({ siguienteId: ultimoId + 1 });
  });
});

// Ruta para obtener el nombre del transportador por su ID
app.get("/api/transportador/:id", (req, res) => {
  const transportadorId = req.params.id;
  const query = "SELECT nombre FROM transportador WHERE id = ?";

  connection.query(query, [transportadorId], (err, results) => {
    if (err) {
      console.error("Error al obtener el transportador: ", err);
      return res.status(500).send("Error al obtener el transportador");
    }

    if (results.length === 0) {
      return res.status(404).send("Transportador no encontrado");
    }

    res.json(results[0]);
  });
});

// Inicio del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto http://localhost:${PORT}`);
});
