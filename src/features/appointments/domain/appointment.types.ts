export interface CreateAppointment {
  serviceId: string;
  slotId: string;
  vehicleId?: string;
}
export interface AppointmentFilters {
  status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  period?: 'upcoming' | 'previous';
}
export interface AppointmentDto {
  id: string;
  serviceId: string;
  serviceName: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
  slot: {
    id: string;
    startsAt: string;
    endsAt: string;
    workshopTime: string;
    timeZone: string;
    available: boolean;
  };
  vehicleId: string | null;
  originalPrice: number;
  price: number;
  currency: string;
  durationMinutes: number;
  appliedOfferId: string | null;
  canCancel: boolean;
  createdAt: string;
  cancelledAt: string | null;
}
