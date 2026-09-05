import { Module } from '@nestjs/common';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { AdminOrganizationsController } from './admin.controller';

@Module({
  imports: [OrganizationsModule, UsersModule],
  controllers: [AdminOrganizationsController],
})
export class AdminModule {}
