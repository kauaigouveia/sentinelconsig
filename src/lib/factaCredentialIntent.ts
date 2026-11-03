/** A saved login/autofill value is never an instruction to replace bank credentials. */
export function factaCredentialPatch(raw:{editCredentials?:unknown;username?:unknown;password?:unknown}){
 const hasPassword=typeof raw.password==='string'&&raw.password.trim()!=='';
 if(hasPassword&&raw.editCredentials!==true)throw Error('Ative a edição de credenciais FACTA para alterar a senha da API.');
 if(raw.editCredentials!==true)return {} as {username?:string;password?:string};
 if(raw.username!==undefined&&(typeof raw.username!=='string'||!raw.username.trim()))throw Error('Informe o usuário da API FACTA.');
 if(raw.password!==undefined&&typeof raw.password!=='string')throw Error('Senha da API FACTA inválida.');
 return {username:typeof raw.username==='string'?raw.username.trim():undefined,password:hasPassword?(raw.password as string).trim():undefined};
}
