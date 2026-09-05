import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OrgPlan } from '../../../generated/prisma/enums';

export class CreateOrganizationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  organizationName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  adminName!: string;

  @IsEmail()
  @MaxLength(255)
  adminEmail!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  adminPassword!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(128)
  usersPanelPassword!: string;

  @IsOptional()
  @IsEnum(OrgPlan)
  plan?: OrgPlan;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUsers?: number;

  @IsOptional()
  @IsISO8601()
  trialEndsAt?: string;
}
