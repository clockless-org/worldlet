export default {
  content: {activity: 'Working'},
  fullView: {kind: 'web', url: 'https://www.doordash.com/', platform: 'web'},
 id:'app-doordash',key:'doordash',title:'DoorDash',region:'money',
 description:'Your delivery scooter by the bridge. Ask Fox to find food, prepare a cart and open DoorDash checkout.',
 purpose:'Order food; Fox finds it and prepares your cart',
 version:1,scene:{template:'delivery-scooter',color:'#eb452e',renderer:'delivery-scooter',version:1},
 connection:{kind:'cli',provider:'doordash',capability:'connect',flow:'in-applet'}
};
