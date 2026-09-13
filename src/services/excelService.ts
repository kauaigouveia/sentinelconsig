import ExcelJS from 'exceljs';
import { StorageService } from './storageService';
import {
  extractPartnerCode,
  normalizeCpf,
  formatCpf,
  formatDateOnly,
  isValidCpf,
  parseCurrency,
  formatCurrency,
} from '../lib/utils';
import { Proposal } from '../types';

export interface ImportPreviewRow {
  rowNumber: number;
  rawCpf: string;
  normalizedCpf: string;
  fullName: string;
  proposalNumber: string; // ADE
  rawPartner: string;
  matchedPartnerId?: string;
  matchedPartnerLogin?: string;
  extractedPartnerCode?: string;
  rawProduct: string;
  matchedProductId?: string;
  matchedProductName?: string;
  rawBank: string;
  matchedBankId?: string;
  matchedBankName?: string;
  rawPromoter: string;
  matchedPromoterId?: string;
  matchedPromoterName?: string;
  rawDisbursedValue?: string;
  disbursedValue?: number;
  rawContractBalance?: string;
  contractBalance?: number;
  isExistingProposal?: boolean;
  existingProposalId?: string;
  financialDifferenceDetected?: boolean;
  financialDiffDetails?: string;
  isLegacyInterpretation: boolean;
  legacyInterpretationText?: string;
  isValid: boolean;
  isDuplicate: boolean;
  errors: string[];
}

export interface ImportAnalysisResult {
  fileName: string;
  fileSize?: number;
  totalRows: number;
  validRows: ImportPreviewRow[];
  invalidRows: ImportPreviewRow[];
  duplicateRows: ImportPreviewRow[];
  detectedColumns: Record<string, string>;
  rows: ImportPreviewRow[];
}

export class ExcelService {
  public static readonly MAX_IMPORT_ROWS = 50000;

  /**
   * Parses uploaded Excel/CSV file and analyzes rows with smart column detection
   * and legacy bank-promoter interpretation.
   */
  public static async parseAndAnalyzeFile(file: File): Promise<ImportAnalysisResult> {
    if (file.name.toLowerCase().endsWith('.xls')) {
      throw new Error('Formato .xls não suportado. Converta o arquivo para .xlsx ou .csv.');
    }

    let rawRows: any[][] = [];

    try {
      const data = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(data);
      const worksheet = workbook.worksheets[0];
      if (worksheet) {
        worksheet.eachRow({ includeEmpty: true }, (row) => {
          const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];
          rawRows.push(
            rowValues.map(v => {
              if (v === null || v === undefined) return '';
              if (typeof v === 'object') {
                if ('result' in v && v.result !== undefined) return v.result;
                if ('text' in v && v.text !== undefined) return v.text;
                if ('hyperlink' in v && 'text' in v) return v.text;
                if (v instanceof Date) return v.toISOString();
              }
              return v;
            })
          );
        });
      }
    } catch (excelErr) {
      console.warn('Erro ao processar XLSX no ExcelService, tentando leitor de texto:', excelErr);
    }

    if (!rawRows || rawRows.length < 2) {
      try {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length >= 2) {
          const sep = lines[0].includes(';') ? ';' : (lines[0].includes('\t') ? '\t' : ',');
          rawRows = lines.map(line => line.split(sep).map(col => col.replace(/^["']|["']$/g, '').trim()));
        }
      } catch (textErr) {
        console.warn('Erro ao ler arquivo de texto no ExcelService:', textErr);
      }
    }

    if (!rawRows || rawRows.length < 2) {
      throw new Error('A planilha está vazia ou não contém dados suficientes.');
    }

    if (rawRows.length > ExcelService.MAX_IMPORT_ROWS) {
      throw new Error(`O arquivo excede o limite máximo permitido de ${ExcelService.MAX_IMPORT_ROWS.toLocaleString('pt-BR')} registros para importação.`);
    }

    const headers = rawRows[0].map(h => String(h).trim());
    const columnMap = this.detectColumns(headers);

    const partners = StorageService.getPartners();
    const products = StorageService.getProducts();
    const banks = StorageService.getBanks();
    const promoters = StorageService.getPromoters();
    const existingProposals = StorageService.getProposals();

    const previewRows: ImportPreviewRow[] = [];
    const seenAdesInFile = new Set<string>();

    for (let r = 1; r < rawRows.length; r++) {
      const row = rawRows[r];
      if (!row || row.every((c: any) => String(c).trim() === '')) continue; // skip empty rows

      const rawCpf = columnMap.cpf >= 0 ? String(row[columnMap.cpf]).trim() : '';
      const rawName = columnMap.name >= 0 ? String(row[columnMap.name]).trim() : '';
      const rawAde = columnMap.ade >= 0 ? String(row[columnMap.ade]).trim() : '';
      const rawPartner = columnMap.partner >= 0 ? String(row[columnMap.partner]).trim() : '';
      const rawProduct = columnMap.product >= 0 ? String(row[columnMap.product]).trim() : '';
      let rawBank = columnMap.bank >= 0 ? String(row[columnMap.bank]).trim() : '';
      let rawPromoter = columnMap.promoter >= 0 ? String(row[columnMap.promoter]).trim() : '';
      const rawDisbursed = columnMap.disbursed >= 0 ? String(row[columnMap.disbursed]).trim() : '';
      const rawContractBalance = columnMap.contractBalance >= 0 ? String(row[columnMap.contractBalance]).trim() : '';

      const disbursedValue = rawDisbursed ? parseCurrency(rawDisbursed) : undefined;
      const contractBalance = rawContractBalance ? parseCurrency(rawContractBalance) : undefined;

      const errors: string[] = [];
      let isLegacy = false;
      let legacyText = '';

      // Legacy parsing check: "C6 - DG" or "C6 - PROSPECTA"
      const bankUpper = rawBank.toUpperCase();
      if (bankUpper.includes(' - ') || bankUpper.includes(' / ')) {
        const parts = bankUpper.split(/[-/]/).map(s => s.trim());
        if (parts.length >= 2) {
          const bankPart = parts[0];
          const promoterPart = parts[1];

          // Check if matches a bank
          const foundBank = banks.find(b => b.name.toUpperCase().includes(bankPart) || (bankPart.includes('C6') && b.name.includes('C6')));
          const foundPromoter = promoters.find(p => p.name.toUpperCase() === promoterPart);

          if (foundBank && foundPromoter) {
            rawBank = foundBank.name;
            rawPromoter = foundPromoter.name;
            isLegacy = true;
            legacyText = `Coluna original "${bankUpper}" interpretada como: Banco: ${foundBank.name}, Promotora: ${foundPromoter.name}`;
          }
        }
      }

      // CPF check
      const normalizedCpf = normalizeCpf(rawCpf);
      if (normalizedCpf.length !== 11) {
        errors.push('CPF inválido ou incompleto (deve conter 11 dígitos).');
      }

      // ADE check
      if (!rawAde) {
        errors.push('ADE/Proposta não informada.');
      }

      // Duplicate & Financial update check
      let isDuplicate = false;
      let isExistingProposal = false;
      let existingProposalId: string | undefined;
      let financialDifferenceDetected = false;
      let financialDiffDetails: string | undefined;

      if (rawAde) {
        const cleanAdeUpper = rawAde.toUpperCase();
        if (seenAdesInFile.has(cleanAdeUpper)) {
          isDuplicate = true;
          errors.push(`ADE duplicada dentro do próprio arquivo (${rawAde}).`);
        } else {
          seenAdesInFile.add(cleanAdeUpper);
        }

        const dbDup = existingProposals.find(p => p.proposalNumber.toUpperCase() === cleanAdeUpper);
        if (dbDup) {
          isExistingProposal = true;
          existingProposalId = dbDup.id;

          // Check if spreadsheet contains financial values that differ from current proposal in DB
          const hasFinancialsInRow = disbursedValue !== undefined || contractBalance !== undefined;
          const disbursedDiff = disbursedValue !== undefined && disbursedValue !== dbDup.disbursedValue;
          const contractDiff = contractBalance !== undefined && contractBalance !== dbDup.contractBalance;

          if (hasFinancialsInRow && (disbursedDiff || contractDiff)) {
            financialDifferenceDetected = true;
            const diffParts: string[] = [];
            if (disbursedDiff) {
              diffParts.push(
                `Liberado: ${dbDup.disbursedValue !== undefined ? formatCurrency(dbDup.disbursedValue) : 'Não informado'} -> ${formatCurrency(disbursedValue)}`
              );
            }
            if (contractDiff) {
              diffParts.push(
                `Saldo: ${dbDup.contractBalance !== undefined ? formatCurrency(dbDup.contractBalance) : 'Não informado'} -> ${formatCurrency(contractBalance)}`
              );
            }
            financialDiffDetails = `Proposta existente com atualização de valores (${diffParts.join(' | ')})`;
            // Not a blocking fatal duplicate: It can be updated!
            isDuplicate = false;
          } else {
            isDuplicate = true;
            errors.push(`Esta proposta já está cadastrada no sistema (ADE ${rawAde}) com os mesmos valores.`);
          }
        }
      }

      // Partner matching by Partner.login (NOME@CODIGO)
      let matchedPartnerId: string | undefined;
      let matchedPartnerLogin: string | undefined;
      let extractedCode: string | undefined;

      if (rawPartner) {
        const partnerClean = rawPartner.toUpperCase();
        const found = partners.find(p => p.login.toUpperCase() === partnerClean);
        if (found) {
          matchedPartnerId = found.id;
          matchedPartnerLogin = found.login;
          extractedCode = extractPartnerCode(found.login);
          // auto-suggest promoter if not provided
          if (!rawPromoter) {
            const prom = promoters.find(p => p.id === found.promoterId);
            if (prom) rawPromoter = prom.name;
          }
        } else {
          errors.push(`Parceiro ${rawPartner} não cadastrado.`);
        }
      } else {
        errors.push('Parceiro não informado.');
      }

      // Product matching
      let matchedProductId: string | undefined;
      let matchedProductName: string | undefined;
      if (rawProduct) {
        const prodUpper = rawProduct.toUpperCase();
        const found = products.find(p => p.name.toUpperCase() === prodUpper || prodUpper.includes(p.name.toUpperCase()));
        if (found) {
          matchedProductId = found.id;
          matchedProductName = found.name;
        } else {
          // Default to PORTABILIDADE if includes port
          if (prodUpper.includes('PORT')) {
            const port = products.find(p => p.name === 'PORTABILIDADE');
            if (port) {
              matchedProductId = port.id;
              matchedProductName = port.name;
            }
          } else {
            errors.push(`Produto "${rawProduct}" não reconhecido.`);
          }
        }
      } else {
        // Fallback default
        const defaultProd = products[0];
        matchedProductId = defaultProd.id;
        matchedProductName = defaultProd.name;
      }

      // Bank matching
      let matchedBankId: string | undefined;
      let matchedBankName: string | undefined;
      if (rawBank) {
        const bankUpperClean = rawBank.toUpperCase();
        const found = banks.find(b => b.name.toUpperCase() === bankUpperClean || bankUpperClean.includes(b.name.toUpperCase()) || (bankUpperClean.includes('C6') && b.name.includes('C6')));
        if (found) {
          matchedBankId = found.id;
          matchedBankName = found.name;
        } else {
          errors.push(`Banco "${rawBank}" não cadastrado.`);
        }
      } else {
        errors.push('Banco não informado.');
      }

      // Promoter matching
      let matchedPromoterId: string | undefined;
      let matchedPromoterName: string | undefined;
      if (rawPromoter) {
        const promUpper = rawPromoter.toUpperCase();
        const found = promoters.find(p => p.name.toUpperCase() === promUpper);
        if (found) {
          matchedPromoterId = found.id;
          matchedPromoterName = found.name;
        } else {
          errors.push(`Promotora "${rawPromoter}" não cadastrada.`);
        }
      } else {
        // Use DG as default if partner is DG
        const dg = promoters.find(p => p.name === 'DG');
        if (dg) {
          matchedPromoterId = dg.id;
          matchedPromoterName = dg.name;
        } else {
          errors.push('Promotora não informada.');
        }
      }

      // Bank + Promoter combination validation
      if (matchedBankId && matchedPromoterId) {
        if (!StorageService.isBankPromoterAllowed(matchedBankId, matchedPromoterId)) {
          errors.push(`Promotora "${matchedPromoterName}" NÃO está habilitada para o banco "${matchedBankName}".`);
        }
      }

      const isValid = errors.length === 0;

      previewRows.push({
        rowNumber: r + 1,
        rawCpf,
        normalizedCpf,
        fullName: rawName || 'CLIENTE NÃO NOMEADO',
        proposalNumber: rawAde,
        rawPartner,
        matchedPartnerId,
        matchedPartnerLogin,
        extractedPartnerCode: extractedCode,
        rawProduct,
        matchedProductId,
        matchedProductName,
        rawBank,
        matchedBankId,
        matchedBankName,
        rawPromoter,
        matchedPromoterId,
        matchedPromoterName,
        rawDisbursedValue: rawDisbursed,
        disbursedValue,
        rawContractBalance: rawContractBalance,
        contractBalance,
        isExistingProposal,
        existingProposalId,
        financialDifferenceDetected,
        financialDiffDetails,
        isLegacyInterpretation: isLegacy,
        legacyInterpretationText: legacyText,
        isValid,
        isDuplicate,
        errors,
      });
    }

    const detectedMap: Record<string, string> = {
      CPF: headers[columnMap.cpf] || 'Não detectada',
      Nome: headers[columnMap.name] || 'Não detectada',
      ADE: headers[columnMap.ade] || 'Não detectada',
      Parceiro: headers[columnMap.partner] || 'Não detectada',
      Produto: headers[columnMap.product] || 'Não detectada',
      Banco: headers[columnMap.bank] || 'Não detectada',
      Promotora: headers[columnMap.promoter] || 'Não detectada',
      'Valor Liberado': headers[columnMap.disbursed] || 'Não detectada',
      'Saldo Contrato': headers[columnMap.contractBalance] || 'Não detectada',
    };

    const invalidRows = previewRows.filter(r => !r.isValid && !r.isDuplicate);
    const duplicateRows = previewRows.filter(r => r.isDuplicate);

    // If exceptions / warnings were detected during analysis, record a system log for support diagnostics
    if (invalidRows.length > 0 || duplicateRows.length > 0) {
      const activeUser = StorageService.getActiveUser();
      StorageService.addSystemExceptionLog({
        severity: invalidRows.length > 0 ? 'WARNING' : 'INFO',
        operation: 'IMPORT_EXCEL',
        title: `Análise de Planilha Excel: ${file.name}`,
        message: `Planilha analisada com ${invalidRows.length} linha(s) inválida(s) e ${duplicateRows.length} ADE(s) duplicada(s).`,
        details: `Total de linhas: ${previewRows.length} | Válidas: ${previewRows.length - invalidRows.length - duplicateRows.length}`,
        contextData: {
          fileName: file.name,
          totalRows: previewRows.length,
          invalidCount: invalidRows.length,
          duplicateCount: duplicateRows.length,
          sampleInvalidRows: invalidRows.slice(0, 10).map(r => ({
            row: r.rowNumber,
            cpf: r.rawCpf,
            ade: r.proposalNumber,
            partner: r.rawPartner,
            errors: r.errors,
          })),
        },
        userId: activeUser.id,
        userName: activeUser.name,
        userRole: activeUser.role,
      });
    }

    return {
      fileName: file.name,
      fileSize: file.size,
      totalRows: previewRows.length,
      validRows: previewRows.filter(r => r.isValid),
      invalidRows,
      duplicateRows,
      detectedColumns: detectedMap,
      rows: previewRows,
    };
  }

  /**
   * Executes the batch import of valid rows
   */
  public static executeImport(validRows: ImportPreviewRow[], fileName?: string): { importedCount: number; errors: string[] } {
    const errors: string[] = [];
    let importedCount = 0;
    const activeUser = StorageService.getActiveUser();

    const successfulAdes: string[] = [];

    for (const row of validRows) {
      try {
        // If this is an existing proposal with updated financial values, update its financials!
        if (row.isExistingProposal && row.existingProposalId) {
          StorageService.updateProposalFinancials(
            row.existingProposalId,
            {
              disbursedValue: row.disbursedValue,
              contractBalance: row.contractBalance,
            },
            'IMPORTACAO',
            fileName
          );
          successfulAdes.push(row.proposalNumber);
          importedCount++;
          continue;
        }

        // 1. Get or create Client (one client can have multiple proposals!)
        const client = StorageService.getOrCreateClient({
          cpf: row.normalizedCpf,
          fullName: row.fullName,
        });

        // 2. Create Proposal with financial values
        StorageService.createProposal(
          {
            proposalNumber: row.proposalNumber,
            clientId: client.id,
            productId: row.matchedProductId!,
            bankId: row.matchedBankId!,
            promoterId: row.matchedPromoterId!,
            partnerId: row.matchedPartnerId!,
            digitizerId: activeUser.id,
            disbursedValue: row.disbursedValue,
            contractBalance: row.contractBalance,
            notes: row.isLegacyInterpretation ? row.legacyInterpretationText : undefined,
          },
          'IMPORTACAO'
        );

        successfulAdes.push(row.proposalNumber);
        importedCount++;
      } catch (err: any) {
        const errMsg = `Linha ${row.rowNumber} (${row.proposalNumber}): ${err.message}`;
        errors.push(errMsg);
      }
    }

    // Add Audit Log
    StorageService.addAuditLog({
      action: 'IMPORTAR_EXCEL',
      entity: 'Proposal',
      entityId: `import-${importedCount}`,
      newData: JSON.stringify({
        importedCount,
        totalSubmitted: validRows.length,
        errorsCount: errors.length,
        errors: errors.slice(0, 50),
        successfulAdes: successfulAdes.slice(0, 50),
      }),
    });

    // If any execution error occurred during import, record System Exception Log for Tech Support
    if (errors.length > 0) {
      StorageService.addSystemExceptionLog({
        severity: 'ERROR',
        operation: 'IMPORT_EXCEL',
        title: `Falha na execução de importação em lote (${errors.length} erro(s))`,
        message: `Foram importadas ${importedCount} de ${validRows.length} propostas. ${errors.length} linhas falharam durante a gravação.`,
        details: errors.join('\n'),
        contextData: {
          importedCount,
          totalSubmitted: validRows.length,
          errorsCount: errors.length,
          errorList: errors,
        },
        userId: activeUser.id,
        userName: activeUser.name,
        userRole: activeUser.role,
      });
    }

    return { importedCount, errors };
  }

  /**
   * Smart column header detector
   */
  private static detectColumns(headers: string[]): {
    cpf: number;
    name: number;
    ade: number;
    partner: number;
    product: number;
    bank: number;
    promoter: number;
    disbursed: number;
    contractBalance: number;
  } {
    const map = {
      cpf: -1,
      name: -1,
      ade: -1,
      partner: -1,
      product: -1,
      bank: -1,
      promoter: -1,
      disbursed: -1,
      contractBalance: -1,
    };

    headers.forEach((h, idx) => {
      const clean = h.trim().toUpperCase();

      if (clean === 'CPF' || clean.includes('CPF DO CLIENTE') || clean.includes('CPF')) {
        if (map.cpf === -1) map.cpf = idx;
      }
      if (clean === 'NOME' || clean.includes('NOME DO CLIENTE') || clean.includes('CLIENTE')) {
        if (map.name === -1) map.name = idx;
      }
      if (
        clean === 'ADE' ||
        clean === 'PROPOSTA' ||
        clean.includes('Nº PROPOSTA') ||
        clean.includes('ADE/PROPOSTA') ||
        clean.includes('NUMERO PROPOSTA')
      ) {
        if (map.ade === -1) map.ade = idx;
      }
      if (clean.includes('PARCEIRO') || clean.includes('AGENTE') || clean.includes('LOGIN PARCEIRO')) {
        if (map.partner === -1) map.partner = idx;
      }
      if (clean.includes('PRODUTO') || clean.includes('TIPO DO PRODUTO') || clean.includes('TIPO')) {
        if (map.product === -1) map.product = idx;
      }
      if (clean.includes('BANCO') || clean.includes('BANCO DESTINO')) {
        if (map.bank === -1) map.bank = idx;
      }
      if (clean.includes('PROMOTORA') || clean.includes('PROMOTORA DE VÍNCULO') || clean.includes('PROMOTORA DE VINCULO')) {
        if (map.promoter === -1) map.promoter = idx;
      }
      if (
        clean.includes('LIBERADO') ||
        clean.includes('VLR LIBERADO') ||
        clean.includes('VALOR LIBERADO') ||
        clean.includes('VALOR CLIENTE') ||
        clean.includes('TROCO') ||
        clean.includes('VALOR LIQUIDO') ||
        clean.includes('VALOR LÍQUIDO') ||
        clean.includes('LIQUIDO') ||
        clean.includes('LÍQUIDO')
      ) {
        if (map.disbursed === -1) map.disbursed = idx;
      }
      if (
        clean.includes('SALDO') ||
        clean.includes('DEVEDOR') ||
        clean.includes('QUITACAO') ||
        clean.includes('QUITAÇÃO') ||
        clean.includes('SALDO DO CONTRATO') ||
        clean.includes('SALDO CONTRATO') ||
        clean.includes('VALOR DO SALDO')
      ) {
        if (map.contractBalance === -1) map.contractBalance = idx;
      }
    });

    return map;
  }

  /**
   * Exportação Padrão para Envio (Digitador):
   * Columns: ADE | CPF | CODIGO DO PARCEIRO | DATA EXPORTAÇÃO
   * IMPORTANT:
   *   "Se parceiro KAUAI@16740, exportar 16740. NUNCA KAUAI@16740. Utilizar extractPartnerCode()."
   */
  public static async exportStandard(
    proposals: Proposal[],
    productFilterName: string = 'TODOS'
  ): Promise<{ fileName: string }> {
    const clients = StorageService.getClients();
    const partners = StorageService.getPartners();
    const today = new Date();
    const todayFormatted = formatDateOnly(today.toISOString());
    const dateStamp = today.toISOString().split('T')[0];

    const cleanProductSlug = productFilterName.replace(/\s+/g, '_').toUpperCase();
    const fileName = `PROPOSTAS_${cleanProductSlug}_${dateStamp}.xlsx`;

    const dataRows = proposals.map(p => {
      const client = clients.find(c => c.id === p.clientId);
      const partner = partners.find(pt => pt.id === p.partnerId);
      const partnerCode = partner ? extractPartnerCode(partner.login) : '';

      return {
        ADE: p.proposalNumber,
        CPF: normalizeCpf(client?.cpf || ''),
        'CODIGO DO PARCEIRO': partnerCode,
        'DATA EXPORTAÇÃO': todayFormatted,
      };
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Propostas');

    if (dataRows.length > 0) {
      const headers = Object.keys(dataRows[0]);
      worksheet.addRow(headers);
      dataRows.forEach(item => {
        worksheet.addRow(headers.map(h => (item as any)[h]));
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);

    // Log the export
    StorageService.addExportLog({
      productName: productFilterName,
      filters: `Exportação Padrão | Qtd: ${proposals.length}`,
      quantity: proposals.length,
      fileName,
    });

    return { fileName };
  }

  /**
   * Exportação Personalizada Completa (Relatórios com Filtros Seletivos):
   */
  public static async exportCustom(
    proposals: Proposal[],
    selectedColumns: string[],
    filtersSummary: string,
    format: 'XLSX' | 'CSV' = 'XLSX'
  ): Promise<{ fileName: string }> {
    const clients = StorageService.getClients();
    const partners = StorageService.getPartners();
    const products = StorageService.getProducts();
    const banks = StorageService.getBanks();
    const promoters = StorageService.getPromoters();
    const statuses = StorageService.getStatuses();
    const users = StorageService.getUsers();

    const dateStamp = new Date().toISOString().split('T')[0];
    const extension = format === 'CSV' ? 'csv' : 'xlsx';
    const fileName = `RELATORIO_PRODUCAO_${dateStamp}.${extension}`;

    const dataRows = proposals.map(p => {
      const client = clients.find(c => c.id === p.clientId);
      const partner = partners.find(pt => pt.id === p.partnerId);
      const product = products.find(pr => pr.id === p.productId);
      const bank = banks.find(b => b.id === p.bankId);
      const promoter = promoters.find(pr => pr.id === p.promoterId);
      const status = statuses.find(s => s.id === p.statusId);
      const digitizer = users.find(u => u.id === p.digitizerId);

      const row: Record<string, any> = {};

      if (selectedColumns.includes('ADE')) row['ADE / PROPOSTA'] = p.proposalNumber;
      if (selectedColumns.includes('CPF')) row['CPF'] = normalizeCpf(client?.cpf || '');
      if (selectedColumns.includes('CPF_FORMATADO')) row['CPF FORMATADO'] = client?.cpf ? formatCpf(client.cpf) : '';
      if (selectedColumns.includes('NOME')) row['NOME DO CLIENTE'] = client?.fullName || '';
      if (selectedColumns.includes('TELEFONE')) row['TELEFONE'] = client?.phone || '';
      if (selectedColumns.includes('EMAIL')) row['E-MAIL'] = client?.email || '';
      if (selectedColumns.includes('PRODUTO')) row['PRODUTO'] = product?.name || '';
      if (selectedColumns.includes('VALOR_LIBERADO')) row['VALOR LIBERADO'] = p.disbursedValue !== undefined ? formatCurrency(p.disbursedValue) : '';
      if (selectedColumns.includes('SALDO_CONTRATO')) row['SALDO DO CONTRATO'] = p.contractBalance !== undefined ? formatCurrency(p.contractBalance) : '';
      if (selectedColumns.includes('BANCO')) row['BANCO'] = bank?.name || '';
      if (selectedColumns.includes('PROMOTORA')) row['PROMOTORA'] = promoter?.name || '';
      if (selectedColumns.includes('PARCEIRO')) row['PARCEIRO'] = partner?.fullName || '';
      if (selectedColumns.includes('LOGIN')) row['LOGIN PARCEIRO'] = partner?.login || '';
      if (selectedColumns.includes('CODIGO_PARCEIRO')) row['CÓDIGO PARCEIRO'] = partner ? extractPartnerCode(partner.login) : '';
      if (selectedColumns.includes('STATUS')) row['STATUS ATUAL'] = status?.name || '';
      if (selectedColumns.includes('ALCADA')) row['ALÇADA RESPONSÁVEL'] = status?.responsibleGroup || status?.responsible || p.currentResponsible || 'NOSSA EQUIPE';
      if (selectedColumns.includes('DATA')) row['DATA DE CADASTRO'] = formatDateOnly(p.createdAt);
      if (selectedColumns.includes('DATA_ATUALIZACAO')) row['ÚLTIMA ATUALIZAÇÃO'] = formatDateOnly(p.updatedAt);
      if (selectedColumns.includes('DIGITADOR')) row['OPERADOR / DIGITADOR'] = digitizer?.name || '';
      if (selectedColumns.includes('OBSERVACOES')) row['OBSERVAÇÕES'] = p.notes || '';

      return row;
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Relatório');

    if (dataRows.length > 0) {
      const headers = Object.keys(dataRows[0]);
      worksheet.addRow(headers);
      dataRows.forEach(item => {
        worksheet.addRow(headers.map(h => item[h]));
      });
    }

    if (format === 'CSV') {
      const buffer = await workbook.csv.writeBuffer();
      const blob = new Blob([buffer], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    }

    StorageService.addExportLog({
      productName: 'PERSONALIZADO',
      filters: `${filtersSummary} | Formato: ${format} | Colunas: ${selectedColumns.length}`,
      quantity: proposals.length,
      fileName,
    });

    return { fileName };
  }
}
