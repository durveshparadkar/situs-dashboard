export interface SalesforceLead {
  Id: string;
  Name?: string;
  FirstName?: string;
  LastName?: string;
  Company?: string;
  Email?: string;
  Phone?: string;
  Status?: string;
  CreatedDate?: string;
  LastModifiedDate?: string;
}

export interface SalesforceOpportunity {
  Id: string;
  Name: string;
  Amount?: number;
  StageName?: string;
  CloseDate?: string;
  Probability?: number;
}

export interface SalesforceAuthResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  issued_at: string;
  signature: string;
  token_type: string;
}

export interface SalesforceQueryResponse<T> {
  totalSize: number;
  done: boolean;
  records: T[];
}

/* =====================================================
   SITUS UNIFIED TYPES
===================================================== */

export interface UnifiedLead {
  externalId: string;
  source: "salesforce";

  name: string;
  email?: string;
  phone?: string;
  company?: string;

  status?: string;

  createdAt?: Date;
  updatedAt?: Date;
}