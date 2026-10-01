# Firma del instalador (SignPath Foundation)

Sin firma, Windows muestra «Windows protegió tu PC» al abrir el instalador.
BB Today es código abierto (MIT), así que puede pedir la firma gratuita de
[SignPath Foundation](https://signpath.org). El editor que verá la gente será
«SignPath Foundation», no una persona.

Condiciones (resumidas de https://signpath.org/terms):

- Licencia aprobada por la OSI y sin componentes propietarios. ✔ MIT.
- Sólo se firma lo que se compila automáticamente desde el código público.
  ✔ `.github/workflows/publicar.yml` compila en GitHub Actions.
- El proyecto debe estar mantenido, publicado y con su página de descarga
  describiendo qué hace. ✔ https://bb-today.pages.dev
- Cada versión firmada se aprueba a mano en su panel.
- Pueden rechazar la solicitud sin dar explicaciones.

## 1. Solicitarla

Formulario: https://signpath.org/apply (con tu cuenta; es un registro a tu
nombre). Lo que suelen pedir, ya redactado — confirma los nombres exactos de
cada campo al llenarlo:

| Campo | Respuesta |
|---|---|
| Proyecto | BB Today |
| Repositorio | https://github.com/Ironmistyfox/bb-today |
| Página | https://bb-today.pages.dev |
| Licencia | MIT |
| Qué se firma | El instalador de Windows (NSIS, `BB-Today-Setup.exe`), generado por electron-builder en GitHub Actions |
| Sistema de compilación | GitHub Actions (`.github/workflows/publicar.yml`), se dispara al subir una etiqueta `vX.Y.Z` |
| Responsable / aprobador | Ironmistyfox (GitHub) |

Descripción (en inglés, que es como revisan):

> BB Today is a free, open-source Windows desktop widget for students that
> shows what is due today on Blackboard Learn (Ultra). It runs locally, talks
> only to the student's own school Blackboard instance through its public REST
> API with the student's own session, is read-only, and has no backend,
> analytics or ads. Releases are built from the public repository by GitHub
> Actions with electron-builder and published as GitHub Releases, from which
> the app updates itself. We would like to sign the NSIS installer so students
> stop seeing the SmartScreen "Windows protected your PC" warning.

## 2. Cuando la aprueben

En el panel de SignPath:

1. Crea (o confirma) el proyecto con el *slug* `bb-today`, conectado a GitHub
   como sistema de compilación de confianza («trusted build system»).
2. Configuración de artefacto: un único archivo PE, `BB-Today-Setup.exe`.
3. Política de firma con el *slug* `release-signing` (la que usa el flujo).
   Si te dan otro nombre, cámbialo en `publicar.yml` (`signing-policy-slug`).
4. Genera un token de API.

En GitHub, en el repo → Settings → Secrets and variables → Actions:

- Secreto `SIGNPATH_API_TOKEN` = el token de API.
- Variable `SIGNPATH_ORGANIZATION_ID` = el id de tu organización en SignPath.

Desde ese momento, cada `npm run publicar` manda el instalador a firmar y
espera (hasta una hora) a que apruebes la firma en el panel de SignPath. Si
el secreto no existe, el flujo publica sin firmar, como hasta ahora.

## Por qué hay un paso «Recalcular latest.yml y blockmap»

El actualizador comprueba el sha512 y el tamaño del instalador contra
`latest.yml`, y descarga sólo lo que cambió gracias al `.blockmap`. Firmar
cambia el `.exe`, así que ambos se recalculan después
(`tools/finalizar-instalador.mjs`). Sin ese paso, las apps instaladas
rechazarían la actualización firmada.
