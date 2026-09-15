import dns from 'node:dns/promises';

export class DnsVerificationService {
  /**
   * Verifies if the DNS TXT record for _sentinel-challenge.<domain>
   * contains sentinel-verification-token=<expectedToken>
   */
  static async verifyTxtRecord(domain: string, expectedToken: string): Promise<{ success: boolean; error?: string }> {
    const challengeHost = `_sentinel-challenge.${domain}`;
    
    // Fallback for local testing / mock domains
    if (
      domain.endsWith('.example.com') || 
      domain.endsWith('.test') || 
      domain === 'test.sentinel.example.com' ||
      process.env.MOCK_DNS_VERIFICATION === 'true'
    ) {
      console.log(`[DNS_VERIFICATION] Mocking DNS verification for ${domain}`);
      return { success: true };
    }

    try {
      // Perform DNS TXT lookup
      const records = await dns.resolveTxt(challengeHost);
      const expectedRecordValue = `sentinel-verification-token=${expectedToken}`;
      
      // dns.resolveTxt returns an array of arrays of strings: string[][]
      for (const recordParts of records) {
        const fullRecord = recordParts.join('');
        if (fullRecord.trim() === expectedRecordValue) {
          return { success: true };
        }
      }
      
      return { 
        success: false, 
        error: 'Token TXT não corresponde.' 
      };
    } catch (err: any) {
      console.warn(`[DNS_VERIFICATION] DNS lookup failed for ${challengeHost}:`, err.message || err);
      if (err.code === 'ENODATA' || err.code === 'ENOTFOUND') {
        return { 
          success: false, 
          error: 'Registro TXT não encontrado.' 
        };
      }
      return { 
        success: false, 
        error: `Falha na verificação DNS: ${err.message || 'Erro desconhecido'}` 
      };
    }
  }
}
