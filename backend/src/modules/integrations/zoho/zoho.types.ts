export interface ZohoLead {
  id: string;

  First_Name?: string;

  Last_Name?: string;

  Email?: string;

  Phone?: string;

  Company?: string;

  Lead_Status?: string;

  Created_Time?: string;

  Modified_Time?: string;
}

export interface ZohoResponse<T> {
  data?: T[];
}

export interface UnifiedLead {
  externalId: string;

  source: "zoho";

  name: string;

  email?: string;

  phone?: string;

  company?: string;

  status?: string;

  createdAt?: Date;

  updatedAt?: Date;
}