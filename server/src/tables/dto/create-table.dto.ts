import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTableDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  number!: number;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  seats!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  section?: string;
}
