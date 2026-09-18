const fs = require('fs');
let content = fs.readFileSync('src/components/admin/PartnerManagement.tsx', 'utf8');

const searchStr2 = `            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Login (NOME@CODIGO) *
              </label>
              <input
                type="text"
                required
                value={login}
                onChange={e => setLogin(e.target.value)}
                placeholder="Ex: KAUAI@16740"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden font-mono"
              />
              {derivedCode && (
                <span className="text-[10px] text-blue-600 dark:text-blue-400 font-mono">
                  Código extraído: {derivedCode}
                </span>
              )}
            </div>`;

const replaceStr2 = `            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Identificador Institucional / Login *
              </label>
              <input
                type="text"
                required
                value={login}
                onChange={e => setLogin(e.target.value)}
                placeholder="Ex: 16740, AL15963, ou KAUAI@16740"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3.5 py-2 text-xs text-slate-900 dark:text-white focus:outline-hidden font-mono"
              />
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                Insira o código exato exigido pela promotora (alfanumérico).
              </span>
            </div>`;

content = content.replace(searchStr2, replaceStr2);

const searchStr3 = `{extractPartnerCode(p.login)}`;
const replaceStr3 = `{p.login}`;
content = content.replace(searchStr3, replaceStr3);

fs.writeFileSync('src/components/admin/PartnerManagement.tsx', content);
