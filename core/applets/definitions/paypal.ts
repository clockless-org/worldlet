export default {
  fullView: {kind:"scene",original:{url:"https://www.paypal.com/",platform:"web"}},
  "id": "app-paypal",
  "key": "paypal",
  "title": "PayPal",
  "region": "money",
  "description": "Read authorized merchant invoices through PayPal MCP; open the website for personal account activity.",
  "purpose": "Fox reads your merchant invoices; the rest stays on PayPal",
  "version": 1,
  "scene": {
    "template": "receipt",
    "color": "#1f3d78",
    "renderer": "preset-device",
    "version": 1
  },
  "connection": {
    "kind": "hermes",
    "provider": "paypal",
    "capability": "connect"
  }
};
