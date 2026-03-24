# φίλος σοφία — Blog + Biblioteca

Un blog filosófico con biblioteca de PDFs y ágora de comentarios,  
desplegado sobre **Cloudflare Pages + R2 + KV**.

---

## Arquitectura

```
Cloudflare Pages  →  public/index.html   (frontend estático)
                 →  functions/api/[[route]].js  (API serverless)
Cloudflare R2    →  PDFs + avatares de usuarios
Cloudflare KV    →  Índice de PDFs + comentarios (JSON)
```

---

## Despliegue paso a paso

### 1. Requisitos previos

```bash
npm install -g wrangler
wrangler login
```

### 2. Crear recursos en Cloudflare

```bash
# Crear bucket R2 para archivos
npx wrangler r2 bucket create filos-sofia-bucket

# Crear namespace KV para datos
npx wrangler kv:namespace create "FILOS_KV"
# → Copia el "id" que te devuelve y pégalo en wrangler.toml
```

### 3. Editar wrangler.toml

Abre `wrangler.toml` y reemplaza:
```toml
id = "YOUR_KV_NAMESPACE_ID"   # ← el id del paso anterior
```

### 4. (Opcional) Cambiar la contraseña de admin

En `public/index.html`, busca esta línea y cambia la contraseña:
```js
const ADMIN_PASSWORD = 'sofia2024';   // ← cámbiala
```
> Para mayor seguridad, puedes mover la validación al Worker y guardar  
> la contraseña como secreto: `wrangler secret put ADMIN_PASSWORD`

### 5. Desplegar

```bash
npx wrangler pages deploy public
```

O conecta tu repositorio Git en el panel de Cloudflare Pages  
(**Settings → Builds & deployments → Connect to Git**) y Cloudflare  
desplegará automáticamente en cada push.

### 6. Variables de entorno en el panel

Si usas secretos (ej: contraseña de admin en el Worker), agrégalos en:  
**Cloudflare Dashboard → Pages → tu-proyecto → Settings → Environment variables**

---

## Estructura del proyecto

```
filos-sofia/
├── public/
│   └── index.html          ← Blog completo (HTML/CSS/JS)
├── functions/
│   └── api/
│       └── [[route]].js    ← API: PDFs + Comentarios
├── wrangler.toml           ← Configuración Cloudflare
└── README.md               ← Este archivo
```

---

## API Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/pdfs` | Listar PDFs de la biblioteca |
| POST | `/api/pdfs` | Subir nuevo PDF (multipart) |
| GET | `/api/pdfs/:id` | Descargar PDF |
| DELETE | `/api/pdfs/:id` | Eliminar PDF |
| GET | `/api/comments` | Listar comentarios |
| POST | `/api/comments` | Publicar comentario (con avatar opcional) |

---

## Personalización

### Cambiar los posts de ejemplo
Edita la sección `<div class="posts">` en `public/index.html` con tus propios artículos.

### Agregar posts dinámicos desde KV
Extiende la API con:
- `GET /api/posts` → lista posts
- `POST /api/posts` → crear post (admin)

### Dominio personalizado
En Cloudflare Pages → Custom domains → Agrega tu dominio.

---

## Licencia

MIT — úsalo libremente con amor a la sabiduría. 🜔
