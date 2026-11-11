#!/usr/bin/env bash
# Gera o relatorio (DOCX e PDF). Requer node (pacote docx), LibreOffice e poppler.
set -euo pipefail
AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS="$(dirname "$AQUI")"
node "$AQUI/gerar_relatorio.js"
(cd "$DOCS" && "${SOFFICE:-soffice}" --headless --convert-to pdf relatorio_ATV3_SO_Alex_Melo.docx >/dev/null 2>&1)
pdfinfo "$DOCS/relatorio_ATV3_SO_Alex_Melo.pdf" | grep Pages
