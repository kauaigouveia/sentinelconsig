import * as XLSX from 'xlsx';
import { StorageService } from './storageService';
import { extractPartnerCode, normalizeCpf, formatCpf, formatDateOnly, isValidCpf } from '../lib/utils';
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
  isLegacyInterpretation: boolean;
  legacyInterpretationText?: string;
  isValid: boolean;
  isDuplicate: boolean;
  errors: string[];
}

export interface ImportAnalysisResult {
  fileName: string;
  totalRows: number;
  validRows: ImportPreviewRow[];
  invalidRows: ImportPreviewRow[];
  duplicateRows: ImportPreviewRow[];
  detectedColumns: Record<string, string>;
  rows: ImportPreviewRow[];
}

export class ExcelService {
  /**
   * Parses uploaded Excel/CSV file and analyzes rows with smart column detection
   * and legacy bank-promoter interpretation.
   */
  public static async parseAndAnalyzeFile(file: File): Promise<ImportAnalysisResult> {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Read as 2D array of strings
    const rawRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (rawRows.length < 2) {
      throw new Error('A planilha está vazia ou não contém dados suficientes.');
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

      // Duplicate check (ADE check against existing database & within file)
      let isDuplicate = false;
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
          isDuplicate = true;
          errors.push(`Esta proposta já está cadastrada no sistema (ADE ${rawAde}).`);
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
  public static executeImport(validRows: ImportPreviewRow[]): { importedCount: number; errors: string[] } {
    const errors: string[] = [];
    let importedCount = 0;
    const activeUser = StorageService.getActiveUser();

    const successfulAdes: string[] = [];

    for (const row of validRows) {
      try {
        // 1. Get or create Client (one client can have multiple proposals!)
        const client = StorageService.getOrCreateClient({
          cpf: row.normalizedCpf,
          fullName: row.fullName,
        });

        // 2. Create Proposal
        StorageService.createProposal(
          {
            proposalNumber: row.proposalNumber,
            clientId: client.id,
            productId: row.matchedProductId!,
            bankId: row.matchedBankId!,
            promoterId: row.matchedPromoterId!,
            partnerId: row.matchedPartnerId!,
            digitizerId: activeUser.id,
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
  } {
    const map = {
      cpf: -1,
      name: -1,
      ade: -1,
      partner: -1,
      product: -1,
      bank: -1,
      promoter: -1,
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
    });

    return map;
  }

  /**
   * Exportação Padrão para Envio (Digitador):
   * Columns: ADE | CPF | CODIGO DO PARCEIRO | DATA EXPORTAÇÃO
   * IMPORTANT:
   *   "Se parceiro KAUAI@16740, exportar 16740. NUNCA KAUAI@16740. Utilizar extractPartnerCode()."
   */
  public static exportStandard(
    proposals: Proposal[],
    productFilterName: string = 'TODOS'
  ): { fileName: string; buffer: any } {
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

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Propostas');

    XLSX.writeFile(workbook, fileName);

    // Log the export
    StorageService.addExportLog({
      productName: productFilterName,
      filters: `Exportação Padrão | Qtd: ${proposals.length}`,
      quantity: proposals.length,
      fileName,
    });

    return { fileName, buffer: workbook };
  }

  /**
   * Exportação Personalizada Completa (Relatórios com Filtros Seletivos):
   */
  public static exportCustom(
    proposals: Proposal[],
    selectedColumns: string[],
    filtersSummary: string,
    format: 'XLSX' | 'CSV' = 'XLSX'
  ): { fileName: string } {
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

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Relatório');

    if (format === 'CSV') {
      XLSX.writeFile(workbook, fileName, { bookType: 'csv' });
    } else {
      XLSX.writeFile(workbook, fileName);
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
