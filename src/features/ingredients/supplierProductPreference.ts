export async function runPreferredSupplierProductAction(id:string,action:(id:string)=>Promise<void>,setPending:(id:string)=>void,setError:(message:string)=>void){
  setPending(id)
  setError('')
  try{await action(id)}catch(cause){const message=cause instanceof Error?cause.message:'Could not mark this Supplier Product preferred.';setError(message);throw cause}finally{setPending('')}
}
