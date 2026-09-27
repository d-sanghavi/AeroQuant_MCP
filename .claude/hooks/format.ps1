$ErrorActionPreference = "Stop"
# AeroQuant MCP - format Python (ruff/black) and the React terminal (prettier).

if (Test-Path "pyproject.toml") {
    if (Get-Command ruff -ErrorAction SilentlyContinue) {
        ruff check --fix .
        ruff format .
    }
    elseif (Get-Command black -ErrorAction SilentlyContinue) {
        black .
    }
}

if ((Test-Path "client\package.json") -and (Test-Path "client\node_modules\.bin\prettier.cmd")) {
    npx --prefix client prettier --write "client/src/**/*.{ts,tsx,css,json}"
}
