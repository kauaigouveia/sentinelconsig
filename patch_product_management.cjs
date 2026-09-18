const fs = require('fs');
let content = fs.readFileSync('src/components/admin/ProductManagement.tsx', 'utf8');

if (!content.includes('import { ProductImportModal }')) {
  content = content.replace(
    `import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';`,
    `import { DeleteConfirmationModal } from '../common/DeleteConfirmationModal';\nimport { ProductImportModal } from './ProductImportModal';`
  );
}

if (!content.includes('isImportModalOpen')) {
  content = content.replace(
    `const [message, setMessage] = useState<string | null>(null);`,
    `const [message, setMessage] = useState<string | null>(null);\n  const [isImportModalOpen, setIsImportModalOpen] = useState(false);`
  );
}

const headerReplace = `<h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
          Cadastrar Nova Linha de Produto
        </h3>`;

const headerReplacement = `<div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
            Cadastrar Nova Linha de Produto
          </h3>
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            Importar Produtos
          </button>
        </div>`;

content = content.replace(headerReplace, headerReplacement);

if (!content.includes('<ProductImportModal')) {
  content = content.replace(
    `</form>
      </div>`,
    `</form>
      </div>
      <ProductImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onImportCompleted={async () => {
          // Trigger a refresh from backend if possible, or just reload local storage
          try {
            const res = await fetch('/api/products');
            if (res.ok) {
              const data = await res.json();
              if (Array.isArray(data)) {
                 const formattedProducts = data.map((pr: any) => ({
                    id: pr.id,
                    name: pr.name,
                    description: pr.description || '',
                    type: pr.type || 'NOVO',
                    allowsMultipleAde: true,
                    requiresPortabilityRelation: false, // We can sync this properly later, using defaults for now
                    active: pr.active,
                    createdAt: pr.createdAt,
                    updatedAt: pr.updatedAt,
                  }));
                  localStorage.setItem('SentinelProducts', JSON.stringify(formattedProducts));
              }
            }
          } catch (e) {
            console.error(e);
          }
          setProducts(StorageService.getProducts());
        }} 
      />`
  );
}

fs.writeFileSync('src/components/admin/ProductManagement.tsx', content);
