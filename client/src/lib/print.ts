import { useQueryClient } from '@tanstack/react-query'
import type { CurrentOrganization, Order } from '@/lib/api'

export function useOrganizationName(): string {
  const queryClient = useQueryClient()
  return (
    queryClient.getQueryData<CurrentOrganization>(['organization'])?.name ??
    'Restobar'
  )
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function ticketHtml(order: Order, orgName: string): string {
  const target =
    order.orderType === 'DINE_IN' && order.table
      ? `Mesa ${order.table.number}${
          order.table.section ? ` - ${escapeHtml(order.table.section)}` : ''
        }`
      : 'Para llevar'

  const created = new Date(order.createdAt)
  const dateLabel =
    created.toLocaleDateString('es-PE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }) +
    ' ' +
    created.toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
    })

  const rows = order.items
    .map((item) => {
      const label = item.notes
        ? `${item.productName} (${item.notes})`
        : item.productName
      return `<tr><td class="qty">${item.quantity}</td><td>${escapeHtml(label)}</td></tr>`
    })
    .join('')

  const orderNotes = order.notes
    ? `<p class="notes"><b>Notas:</b> ${escapeHtml(order.notes)}</p>`
    : ''

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Comanda #${order.folio}</title>
<style>
  @page { margin: 0; size: 80mm auto; }
  * { box-sizing: border-box; }
  body {
    width: 72mm;
    margin: 0 auto;
    padding: 4mm;
    font-family: 'Courier New', Courier, monospace;
    font-size: 12px;
    color: #000;
  }
  .center { text-align: center; }
  .brand { font-weight: bold; font-size: 14px; text-transform: uppercase; }
  .divider { border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; vertical-align: top; }
  td.qty { width: 14%; white-space: nowrap; padding-right: 4px; }
  p { margin: 2px 0; }
  .notes { margin-top: 4px; }
</style>
</head>
<body>
  <div class="center brand">${escapeHtml(orgName)}</div>
  <div class="center">COMANDA DE COCINA</div>
  <div class="divider"></div>
  <p><b>#${order.folio}</b> · ${escapeHtml(target)}</p>
  <p>${dateLabel}</p>
  <div class="divider"></div>
  <table>
    ${rows}
  </table>
  <div class="divider"></div>
  ${orderNotes}
  <div class="center">---</div>
  <div class="center">Gracias</div>
</body>
</html>`
}

export function printKitchenTicket(order: Order, orgName: string): void {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) {
    iframe.remove()
    return
  }

  doc.open()
  doc.write(ticketHtml(order, orgName))
  doc.close()

  window.setTimeout(() => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    window.setTimeout(() => iframe.remove(), 1000)
  }, 100)
}
