import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class OpenCashDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999.99)
  openingBalance!: number;
}
