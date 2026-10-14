import React from 'react';
import { PartnerCrmHub } from '../crm/PartnerCrmHub';

export const PartnerManagement: React.FC<{ premium?: boolean }> = ({ premium = false }) => {
  return <PartnerCrmHub premium={premium} />;
};
