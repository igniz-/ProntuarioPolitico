# Prontuario Politico

Una mesa de investigación política orientada a las fuentes. Busca a un funcionario público y recibe un informe en caché sobre su cargo, trayectoria, salario, actividad legislativa, acusaciones y puntos destacados.

## Ejecución local

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`.

## Configuración de Azure

Copia `.env.example` a `.env.local` y añade un endpoint de Azure OpenAI, una clave API y el nombre del deployment. La solicitud de investigación se ejecuta únicamente en el servidor. En desarrollo, la ausencia de credenciales utiliza un registro de ejemplo claramente identificado; en producción, la aplicación falla de forma segura hasta que el proveedor esté configurado.

La investigación se guarda en caché en SQLite dentro de `data/prontuario.db`. Define `CACHE_TTL_HOURS` en `.env.local` para controlar durante cuántas horas el resultado permanece válido; el valor predeterminado es 24. En producción, define `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` para usar una base de datos libSQL alojada.

Los límites de validación de la investigación, los umbrales de confianza, la revalidación de retratos y la configuración de las solicitudes a Azure están centralizados en `src/lib/research-config.ts`. Son ajustes de la aplicación, no parámetros proporcionados por las solicitudes de los usuarios.

## Traducciones

Los textos visibles de la mesa de investigación están en `src/lib/i18n/`, con un catálogo por idioma y tipos compartidos en `types.ts`. Para añadir un idioma, crea su catálogo, regístralo en `src/lib/i18n/index.ts` y amplía la unión `Language`. La interfaz obtiene las traducciones mediante `getTranslation()` en lugar de definir textos dentro de los componentes.

## Lista de comprobación para producción

- Rota cualquier clave de Azure que haya quedado expuesta fuera del gestor de secretos del deployment y guarda la nueva clave únicamente en la configuración cifrada del hosting.
- Usa Turso u otra base de datos libSQL persistente para hosting multiinstancia o serverless; no dependas del archivo SQLite local para la durabilidad en producción.
- Coloca un límite de solicitudes de plataforma o edge delante de `/api/research` y `/api/reports`. La aplicación incluye un límite básico por instancia, pero no sustituye a un límite distribuido en el gateway.
- Los reportes están limitados a tres por IP cada 24 horas, se deduplican por político y fuente durante 24 horas y pasan por un triage acotado en Azure. El triage de IA solo propone correcciones escalares estructuradas; los administradores deben aprobarlas o rechazarlas antes de modificar cualquier perfil en caché.
- Despliega detrás de HTTPS y verifica las cabeceras de seguridad configuradas, el alcance de los secretos del proveedor, las copias de seguridad, los logs y el proceso de moderación de reportes.

## Panel de administración y analítica

Define `ADMIN_TOKEN` en el gestor de secretos del deployment y abre `/admin` para iniciar sesión. El token se intercambia por una cookie HttpOnly de corta duración; nunca se guarda en el navegador ni se envía en la URL. En producción, define `ADMIN_SESSION_SECRET` con un valor independiente y de alta entropía para firmar la cookie de sesión.

El panel muestra visitas, visitantes únicos diarios, duración media de las sesiones, rutas más consultadas y copias exitosas de enlaces de perfiles. La analítica guarda marcas de tiempo de eventos, identificadores de sesión y un hash diario derivado de la IP de la solicitud; las direcciones IP sin procesar no se persisten. Define `ANALYTICS_HASH_SECRET` con un valor independiente y de alta entropía, y configura la política de retención de la base de datos según tu deployment.

Los reportes rechazados permanecen en la base de datos como historial de moderación, pero desaparecen de la cola pendiente. Los reportes aprobados deben contener una corrección estructurada para un campo escalar permitido, como `position`, `tenure` o `salary`; la corrección se aplica al perfil en caché, se actualiza la caché correspondiente y el reporte aprobado se elimina. Los parches JSON arbitrarios, los cambios de fuentes y las ediciones de arrays no se aplican automáticamente.

## Registro de funcionarios

El autocompletado lee el registro ligero de descubrimiento desde la tabla `politician_registry` en SQLite/libSQL. Los registros contienen únicamente metadatos de identidad y directorio; al seleccionar uno, se ejecuta el flujo normal de investigación orientado a las fuentes. El registro JSON de seed ya no se utiliza.

Comprueba las fuentes del registro y actualiza los retratos de Wikimedia sin extracción mediante IA:

```bash
npm run registry:check
npm run registry:refresh
```

El comando de actualización es adecuado para ejecutarse posteriormente mediante un cron del sistema. Valida cada URL de origen, actualiza las miniaturas de Wikipedia cuando el registro utiliza una fuente de Wikipedia, descubre miembros legislativos actuales mediante consultas acotadas de posiciones `P39` en Wikidata y directorios oficiales estructurados, y hace upsert de los registros directamente en SQLite/libSQL. El despliegue inicial por países cubre Irlanda, Estados Unidos, Reino Unido, Canadá, España, México, Argentina, Colombia y Australia. Estas fuentes están deliberadamente acotadas y no deben interpretarse como afirmaciones de cobertura completa mientras se amplía el alcance. El comando conserva los registros cuya fuente no está disponible temporalmente.

Las fuentes de descubrimiento se configuran en `data/registry-sources.json`. Las fuentes de Wikidata utilizan consultas acotadas de listas de posiciones `P39`, excluyen declaraciones con fecha de finalización y añaden candidatos con su URL de Wikidata, país, región, cargo, distrito y una imagen opcional de Commons. Argentina también utiliza la exportación JSON oficial del Senado, la exportación CSV oficial de HCDN y el CSV de ReFeGLo publicado a través de Datos Argentina. ReFeGLo proporciona autoridades de gobiernos locales y se actualiza con una periodicidad eventual, por lo que esos registros deben tratarse como pistas de directorio y verificarse en el sitio web vigente del gobierno local. Los nuevos tipos de fuente deben tener un parser explícito en `scripts/refresh-registry.mjs`; evita añadir scraping HTML genérico cuando exista un endpoint estructurado.

Para una entrada de cron, ejecuta el comando desde el directorio del proyecto, por ejemplo:

```cron
15 3 * * 1 cd /path/to/ProntuarioPolitico && npm run registry:refresh >> data/registry-refresh.log 2>&1
```
