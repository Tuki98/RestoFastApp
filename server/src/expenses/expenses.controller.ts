import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { ExpenseCategory } from '../../generated/prisma/enums';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  @RequirePermissions('expenses:manage')
  findAll(
    @CurrentUser('organizationId') organizationId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('category') category?: ExpenseCategory,
  ) {
    return this.expensesService.findAll(organizationId, {
      from,
      to,
      category,
    });
  }

  @Post()
  @RequirePermissions('expenses:manage')
  create(
    @CurrentUser('organizationId') organizationId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CreateExpenseDto,
  ) {
    return this.expensesService.create(organizationId, userId, dto);
  }

  @Patch(':id')
  @RequirePermissions('expenses:manage')
  update(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(organizationId, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('expenses:manage')
  remove(
    @CurrentUser('organizationId') organizationId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expensesService.remove(organizationId, id);
  }
}
