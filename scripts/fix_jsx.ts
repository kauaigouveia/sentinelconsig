import fs from 'fs';

let sidebar = fs.readFileSync('src/components/layout/Sidebar.tsx', 'utf-8');

// Replace the broken block
const broken = `            <img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} className="h-full w-full object-contain rounded-lg shadow-2xs" referrerPolicy="no-referrer" />
              </div>
            )}
          </div>`;

const fixed = `            <img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} className="h-full w-full object-contain rounded-lg shadow-2xs" referrerPolicy="no-referrer" />
          </div>`;

sidebar = sidebar.replace(broken, fixed);

const broken2 = `            <div className="h-8.5 w-8.5 flex items-center justify-center shrink-0 mt-0.5">
              <img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} className="h-full w-full object-contain rounded-lg shadow-2xs" referrerPolicy="no-referrer" />
              </div>
            )}
            </div>`;

const fixed2 = `            <div className="h-8.5 w-8.5 flex items-center justify-center shrink-0 mt-0.5">
              <img src={SYSTEM_IDENTITY.defaultLogo} alt={SYSTEM_IDENTITY.name} className="h-full w-full object-contain rounded-lg shadow-2xs" referrerPolicy="no-referrer" />
            </div>`;
sidebar = sidebar.replace(broken2, fixed2);

fs.writeFileSync('src/components/layout/Sidebar.tsx', sidebar);
console.log('Fixed JSX');
