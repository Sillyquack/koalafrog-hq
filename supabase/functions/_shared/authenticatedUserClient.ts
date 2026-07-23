export function authenticatedUserClientOptions(authorization:string,customFetch?:typeof fetch){
 return{global:{headers:{Authorization:authorization},...(customFetch?{fetch:customFetch}:{})}}
}
