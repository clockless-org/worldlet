export default {
 id:'app-stripe',key:'stripe',title:'Stripe',region:'money',version:1,
 description:'Read today’s collected payments, recurring revenue and customer billing history.',
 purpose:'Fox reads your payments, revenue and billing history',
 fullView:{kind:'scene',original:{url:'https://dashboard.stripe.com/',platform:'web'}},scene:{template:'coins',color:'#635bff',renderer:'stripe-terminal',version:1},
 connection:{kind:'native',provider:'stripe',capability:'connect',flow:'in-applet'}
};
