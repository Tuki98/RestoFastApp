import { Type } from 'class-transformer';
import {
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

export class UpdateOrganizationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(OrgPlan)
  plan?: OrgPlan;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100000)
  maxUsers?: number | null;

  @IsOptional()
  @IsISO8601()
  trialEndsAt?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(128)
  usersPanelPassword?: string;
}
