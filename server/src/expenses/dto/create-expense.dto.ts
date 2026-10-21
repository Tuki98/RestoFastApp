import {
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ExpenseCategory } from '../../../generated/prisma/enums';

export class CreateExpenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999.99)
  @Type(() => Number)
  amount!: number;

  @IsOptional()
  @IsEnum(ExpenseCategory)
  category?: ExpenseCategory;

  @IsOptional()
  @IsISO8601()
  incurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
