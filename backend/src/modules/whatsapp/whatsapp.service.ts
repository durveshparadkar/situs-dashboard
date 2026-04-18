class WhatsAppService {
  async sendTemplateMessage(
    phone: string,
    template: string,
    variables: any
  ) {
    console.log("📲 Sending WhatsApp:", {
      phone,
      template,
      variables,
    });
  }
}

export default new WhatsAppService();