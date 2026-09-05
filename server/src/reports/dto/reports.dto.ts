import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class ReportsRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class TrendQueryDto extends ReportsRangeDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  granularity: 'day' | 'week' | 'month' = 'day';
}

export class TopProductsQueryDto extends ReportsRangeDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
