# Rotación de funcionarios del Estado peruano (2020–2026)

Tablero sobre cuánto duran los directivos en sus cargos, entre qué entidades se mueven y quién llega con quién.
Se basa en las resoluciones de designación, conclusión y renuncia publicadas en el diario oficial *El Peruano*
desde el 1 de enero de 2020.

**Ver el tablero:** https://incidencia-egpp.github.io/rotacion-funcionarios/

## Contenido
- `index.html`, `app.js`, `tablero.css`: el tablero.
- `comun/`: estilos y componentes compartidos de los tableros del Observatorio (ECharts 5.6).
- `datos/`: los datos que usa el tablero, en JSON.

## Ver en local
```bash
python3 -m http.server 8765
```
y abrir http://localhost:8765 (abrir `index.html` con doble clic no carga los datos).

## Actualizar
Los datos se generan en el proyecto de trabajo con `tablero/construir_datos_v2.py` y se copian a `datos/`.
