# φίλος σοφία

Un espacio digital dedicado a la filosofía, la reflexión y el amor al saber.  
Blog, biblioteca de PDFs, videoteca, aforismos, noticias y ágora pública.

Desplegado sobre **Cloudflare Pages + R2 + KV + D1**.

---

## Arquitectura

| Servicio | Uso |
|----------|-----|
| **Cloudflare Pages** | Frontend estático + Functions (API serverless) |
| **Cloudflare R2** | Almacenamiento de PDFs, avatares e imágenes |
| **Cloudflare KV** | Posts, índice de PDFs, comentarios, noticias |
| **Cloudflare D1** | Aforismos (quotes) y videos |

---

## Estructura del proyecto

```
filos-sofia/
├── public/
│   ├── index.html          Inicio — blog + feed de noticias
│   ├── biblioteca.html     Biblioteca de PDFs descargables
│   ├── agora.html          Comentarios públicos con avatar
│   ├── aforismos.html      Citas y sentencias con retrato
│   ├── videoteca.html      Videos de YouTube embebidos
│   ├── admin.html          Panel de administración
│   └── style.css           Estilos globales (tema claro/oscuro)
├── functions/api/
│   ├── [[route]].js        API principal — auth, posts, news, pdfs, comments, avatars
│   ├── quotes.js           GET/POST aforismos (D1)
│   ├── quotes/[id].js      DELETE aforismo
│   ├── videos.js           GET/POST videos (D1)
│   ├── videos/[id].js      DELETE video
│   ├── pdfs/[id].js        GET/DELETE pdf individual
│   └── media.js            Servir imágenes desde R2
├── schema.sql              Tablas D1
├── wrangler.toml           Configuración Cloudflare
└── README.md
```

---

## Despliegue

### 1. Instalar Wrangler y autenticarse

```bash
npm install -g wrangler
wrangler login
```

### 2. Crear recursos en Cloudflare

```bash
npx wrangler r2 bucket create filos-sofia-bucket
npx wrangler kv:namespace create "FILOS_KV"
```

Copiar los IDs generados en `wrangler.toml`.

### 3. Crear tablas en D1

```bash
npx wrangler d1 execute quotes --file=schema.sql
```

### 4. Configurar contraseña de admin

```bash
npx wrangler pages secret put ADMIN_PASSWORD
```

Escribir la contraseña cuando la pida. Se valida en el servidor — nunca aparece en el código fuente.

### 5. Desplegar

**Opción A — Manual:**
```bash
npx wrangler pages deploy public
```

**Opción B — Git (auto-deploy):**  
Conectar el repo en Cloudflare Dashboard → Pages → Settings → Builds & deployments → Connect to Git.

---

## API

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/auth` | Validar contraseña admin |
| `GET` | `/api/posts` | Listar entradas |
| `POST` | `/api/posts` | Crear entrada |
| `GET` | `/api/posts/:id` | Obtener entrada completa |
| `PUT` | `/api/posts/:id` | Editar entrada |
| `DELETE` | `/api/posts/:id` | Eliminar entrada |
| `GET` | `/api/news` | Listar noticias |
| `POST` | `/api/news` | Crear noticia |
| `DELETE` | `/api/news/:id` | Eliminar noticia |
| `GET` | `/api/pdfs` | Listar biblioteca |
| `POST` | `/api/pdfs` | Subir PDF (multipart) |
| `GET` | `/api/pdfs/:id` | Descargar PDF |
| `DELETE` | `/api/pdfs/:id` | Eliminar PDF |
| `GET` | `/api/quotes` | Listar aforismos |
| `POST` | `/api/quotes` | Crear aforismo (multipart, imagen opcional) |
| `DELETE` | `/api/quotes/:id` | Eliminar aforismo |
| `GET` | `/api/videos` | Listar videos |
| `POST` | `/api/videos` | Añadir video de YouTube |
| `DELETE` | `/api/videos/:id` | Eliminar video |
| `GET` | `/api/comments` | Listar comentarios del ágora |
| `POST` | `/api/comments` | Publicar comentario (multipart, avatar opcional) |

---

## Licencia

MIT — úsalo libremente con amor a la sabiduría. 🜔
