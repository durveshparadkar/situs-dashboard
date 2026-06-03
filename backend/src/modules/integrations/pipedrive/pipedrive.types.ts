export interface PipedriveLead {
  id: number;

  title?: string;

  person_name?: string;

  org_name?: string;

  value?: number;

  status?: string;

  add_time?: string;

  update_time?: string;
}

export interface PipedriveResponse<T> {
  data?: T[];
}

export interface UnifiedLead {
  externalId: string;

  source: "pipedrive";

  name: string;

  company?: string;

  value?: number;

  status?: string;

  createdAt?: Date;

  updatedAt?: Date;
}