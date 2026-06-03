export interface HubspotLead {
  id: string;

  properties: {
    firstname?: string;
    lastname?: string;
    email?: string;
    phone?: string;
    company?: string;

    lifecyclestage?: string;

    createdate?: string;
    lastmodifieddate?: string;
  };
}

export interface HubspotResponse<T> {
  results: T[];
}

export interface UnifiedLead {
  externalId: string;
  source: "hubspot";

  name: string;

  email?: string;
  phone?: string;
  company?: string;

  status?: string;

  createdAt?: Date;
  updatedAt?: Date;
}