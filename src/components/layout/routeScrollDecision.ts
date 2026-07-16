export type RouteScrollDecision={kind:'top'}|{kind:'hash';hash:string}|{kind:'restore';top:number}

export function routeScrollDecision(input:{navigationType:'POP'|'PUSH'|'REPLACE';hash:string;savedTop?:number}):RouteScrollDecision{
 if(input.hash)return{kind:'hash',hash:input.hash}
 if(input.navigationType==='POP'&&input.savedTop!=null)return{kind:'restore',top:input.savedTop}
 return{kind:'top'}
}
