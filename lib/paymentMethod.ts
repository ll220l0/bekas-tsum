export type ClientPaymentMethod = "bank" | "cash";

export function toClientPaymentMethod(paymentMethod: string): ClientPaymentMethod {
  return paymentMethod === "cash" ? "cash" : "bank";
}

export function toDbPaymentMethod(paymentMethod: string): "qr_image" | "cash" {
  return paymentMethod === "cash" ? "cash" : "qr_image";
}

export function paymentMethodLabel(paymentMethod: string) {
  return paymentMethod === "cash" ? "\u041D\u0430\u043B\u0438\u0447\u043D\u044B\u043C\u0438" : "Mbank";
}
