import {
  SalesforceLead,
  UnifiedLead,
} from "./salesforce.types.js";

class SalesforceMapper {
  mapLead(lead: SalesforceLead): UnifiedLead {
    return {
      externalId: lead.Id,
      source: "salesforce",

      name:
        lead.Name ||
        `${lead.FirstName || ""} ${lead.LastName || ""}`.trim() ||
        "Unknown",

      ...(lead.Email   !== undefined && { email:   lead.Email }),
      ...(lead.Phone   !== undefined && { phone:   lead.Phone }),
      ...(lead.Company !== undefined && { company: lead.Company }),
      ...(lead.Status  !== undefined && { status:  lead.Status }),

      ...(lead.CreatedDate && { createdAt: new Date(lead.CreatedDate) }),
      ...(lead.LastModifiedDate && {
        updatedAt: new Date(lead.LastModifiedDate),
      }),
    };
  }

  mapLeads(leads: SalesforceLead[]): UnifiedLead[] {
    return leads.map((lead) => this.mapLead(lead));
  }
}

export default new SalesforceMapper();