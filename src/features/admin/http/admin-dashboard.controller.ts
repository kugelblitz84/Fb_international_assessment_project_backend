import { Controller, Get } from '@nestjs/common';
import { Roles } from '../../../core/auth/decorators/roles.decorator';
import { AdminDashboardService } from '../application/admin-dashboard.service';
@Roles('ADMIN')
@Controller({ path: 'admin/dashboard', version: '1' })
export class AdminDashboardController {
  constructor(private readonly service: AdminDashboardService) {}
  @Get() get() {
    return this.service.get();
  }
}
